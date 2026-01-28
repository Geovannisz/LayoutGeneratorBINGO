/**
 * heatmap_gpu.js
 *
 * WebGPU-accelerated Heatmap Renderer for Beam Patterns.
 * Replaces the CPU-based heatmap_worker.js for supported devices.
 */

const VIRIDIS_MAP = [
    [68, 1, 84], [72, 35, 116], [64, 67, 135], [52, 94, 141],
    [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
    [121, 209, 81], [189, 222, 38], [253, 231, 36]
];

class HeatmapGPU {
    constructor() {
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.dataTexture = null;
        this.colormapTexture = null;
        this.sampler = null;
        this.bindGroup = null;
        this.uniformBuffer = null;

        // Configuration
        this.presentationFormat = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';
    }

    /**
     * Heuristic to check if WebGPU is supported and suitable.
     * Checks for adapter existence and 'float32-filterable' feature usually required for float texture sampling.
     * We can implement manual lerp if needed, but for now we check the feature.
     */
    static async isSupported() {
        if (!navigator.gpu) return false;
        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
            if (!adapter) return false;

            // Check for texture size limits (2048x2048 is usually safe, but good to check)
            if (adapter.limits.maxTextureDimension2D < 2048) {
                console.warn("GPU Limit: maxTextureDimension2D < 2048");
                return false;
            }

            // We prefer float32-filterable for automatic bilinear interpolation of the data texture.
            // If not present, our shader could fallback to manual lerp, but for simplicity/performance
            // we might treat it as a requirement or just try to enable it.
            // Note: Many mobile devices support WebGPU but not float32 filtering.
            // For high resilience, we request it, if fails, we might still proceed if we handle it in shader.
            // The shader below uses standard `textureSample`, so we need the feature OR use manual sampling.
            // Let's try to request it.
            return true;
        } catch (e) {
            console.error("WebGPU check error:", e);
            return false;
        }
    }

    async init(canvas) {
        if (this.device) return true;

        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw new Error("No WebGPU adapter");

        // Request 'float32-filterable' if available.
        // If not, we will have to use manual interpolation in shader or use a different texture format (e.g. float16).
        // Check availability first.
        const hasFloat32Filterable = adapter.features.has('float32-filterable');
        const requiredFeatures = hasFloat32Filterable ? ['float32-filterable'] : [];

        this.device = await adapter.requestDevice({ requiredFeatures });

        this.context = canvas.getContext('webgpu');
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied',
        });

        // Initialize Colormap (Viridis) - 1D Texture
        this.initColormap();

        // Initialize Pipeline
        await this.initPipeline(hasFloat32Filterable);

        return true;
    }

    initColormap() {
        const width = 256;
        const data = new Uint8Array(width * 4);

        function getViridisColor(t) {
            if (t <= 0) return VIRIDIS_MAP[0];
            if (t >= 1) return VIRIDIS_MAP[VIRIDIS_MAP.length - 1];
            const pos = t * (VIRIDIS_MAP.length - 1);
            const idx = Math.floor(pos);
            const frac = pos - idx;
            const c1 = VIRIDIS_MAP[idx];
            const c2 = VIRIDIS_MAP[idx + 1];
            return [
                Math.round(c1[0] + (c2[0] - c1[0]) * frac),
                Math.round(c1[1] + (c2[1] - c1[1]) * frac),
                Math.round(c1[2] + (c2[2] - c1[2]) * frac)
            ];
        }

        for (let i = 0; i < width; i++) {
            const rgb = getViridisColor(i / (width - 1));
            data[i * 4] = rgb[0];
            data[i * 4 + 1] = rgb[1];
            data[i * 4 + 2] = rgb[2];
            data[i * 4 + 3] = 255;
        }

        this.colormapTexture = this.device.createTexture({
            size: [width, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.device.queue.writeTexture(
            { texture: this.colormapTexture },
            data,
            { bytesPerRow: width * 4 },
            { width: width, height: 1 }
        );
    }

    async initPipeline(hasFloat32Filterable) {
        // Vertex Shader
        const vertWGSL = `
            struct VertexOutput {
                @builtin(position) Position : vec4<f32>,
                @location(0) vUV : vec2<f32>,
            }

            @vertex
            fn main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
                var pos = array<vec2<f32>, 4>(
                    vec2<f32>(-1.0, 1.0),  // Top-Left
                    vec2<f32>(1.0, 1.0),   // Top-Right
                    vec2<f32>(-1.0, -1.0), // Bottom-Left
                    vec2<f32>(1.0, -1.0)   // Bottom-Right
                );

                // UVs assuming 0,0 at Top-Left
                var uvs = array<vec2<f32>, 4>(
                    vec2<f32>(0.0, 0.0),
                    vec2<f32>(1.0, 0.0),
                    vec2<f32>(0.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );

                var output : VertexOutput;
                output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
                output.vUV = uvs[VertexIndex];
                return output;
            }
        `;

        // Fragment Shader
        // Note: We inject a flag for filtering support
        const fragWGSL = `
            struct Uniforms {
                width: f32,
                height: f32,
                scaleType: f32, // 0=Linear, 1=dB, 2=Sqrt, 3=Quad, 4=Fourth
            }

            @group(0) @binding(0) var dataSampler : sampler;
            @group(0) @binding(1) var dataTexture : texture_2d<f32>;
            @group(0) @binding(2) var colormapSampler : sampler;
            @group(0) @binding(3) var colormapTexture : texture_2d<f32>;
            @group(0) @binding(4) var<uniform> uniforms : Uniforms;

            const PI: f32 = 3.14159265359;
            const TWO_PI: f32 = 6.28318530718;

            // Manual Bilinear Interpolation if hardware filtering is not available
            fn sampleDataManual(uv: vec2<f32>) -> f32 {
                let dims = textureDimensions(dataTexture);
                let w = f32(dims.x);
                let h = f32(dims.y);

                let u = uv.x * w - 0.5;
                let v = uv.y * h - 0.5;

                let x0 = i32(floor(u));
                let y0 = i32(floor(v));
                let x1 = x0 + 1;
                let y1 = y0 + 1;

                let f_x = fract(u);
                let f_y = fract(v);

                // Handle Wrapping for Phi (X-axis)
                let x0_w = (x0 % i32(w) + i32(w)) % i32(w);
                let x1_w = (x1 % i32(w) + i32(w)) % i32(w);

                // Clamp for Theta (Y-axis)
                let y0_c = clamp(y0, 0, i32(h) - 1);
                let y1_c = clamp(y1, 0, i32(h) - 1);

                let v00 = textureLoad(dataTexture, vec2<i32>(x0_w, y0_c), 0).r;
                let v10 = textureLoad(dataTexture, vec2<i32>(x1_w, y0_c), 0).r;
                let v01 = textureLoad(dataTexture, vec2<i32>(x0_w, y1_c), 0).r;
                let v11 = textureLoad(dataTexture, vec2<i32>(x1_w, y1_c), 0).r;

                return mix(mix(v00, v10, f_x), mix(v01, v11, f_x), f_y);
            }

            @fragment
            fn main(@location(0) vUV : vec2<f32>) -> @location(0) vec4<f32> {
                let cx = 0.5;
                let cy = 0.5;

                // Aspect Ratio Correction to ensure circle is circular
                // Assuming vUV is 0..1 over the canvas size.
                let ar = uniforms.width / uniforms.height;

                // Coords relative to center
                var dx = vUV.x - cx;
                var dy = vUV.y - cy;

                // Adjust for Non-Square aspect ratio (preserve scale on Min dimension)
                // If w > h (ar > 1), dx is "longer" in UV space?
                // No, UV is square 0..1. Physical pixels are not.
                // We want r in Pixels.

                let dx_px = dx * uniforms.width;
                let dy_px = dy * uniforms.height;

                let r_px = sqrt(dx_px*dx_px + dy_px*dy_px);
                let max_radius_px = min(uniforms.width, uniforms.height) / 2.0 - 2.0;

                if (r_px > max_radius_px) {
                    return vec4<f32>(0.0, 0.0, 0.0, 0.0); // Transparent outside
                }

                // Theta Mapping: r=0 -> Theta=0 (Row 0), r=Max -> Theta=Max (Row N)
                // v coordinate for texture
                let v_tex = r_px / max_radius_px;

                // Phi Mapping: Angle
                // atan2(y, x). Canvas Y is down. UV (0,0) is top-left.
                // dy_px is positive (bottom) when vUV.y > 0.5.
                // We want standard math angle?
                // heatmap_worker: atan2(-dy, dx).
                // Here dy is (y - cy).
                // So atan2(-dy_px, dx_px).

                var angle = atan2(-dy_px, dx_px); // Returns -PI to PI
                // Convert to degrees for logic check or directly to 0..1
                if (angle < 0.0) { angle = angle + TWO_PI; } // 0 .. 2PI

                // Map 0..2PI to 0..1 U coordinate
                let u_tex = angle / TWO_PI;

                // Sample Data
                var val : f32 = 0.0;

                // Use built-in filtering if supported, else manual
                if (${hasFloat32Filterable}) {
                     val = textureSample(dataTexture, dataSampler, vec2<f32>(u_tex, v_tex)).r;
                } else {
                     val = sampleDataManual(vec2<f32>(u_tex, v_tex));
                }

                // Scaling
                var sVal = 0.0;
                let sType = i32(uniforms.scaleType);

                if (sType == 1) { // dB
                    if (val <= 1e-10) { val = 1e-10; }
                    var db = 20.0 * log(val) / log(10.0); // log10(x) = ln(x)/ln(10)
                    let minDb = -60.0;
                    if (db < minDb) { db = minDb; }
                    if (db > 0.0) { db = 0.0; }
                    sVal = (db - minDb) / (0.0 - minDb);
                } else if (sType == 2) { // Sqrt
                    sVal = sqrt(val);
                } else if (sType == 3) { // Quadratic
                    sVal = val * val;
                } else if (sType == 4) { // Fourth Root
                    sVal = pow(val, 0.25);
                } else { // Linear (0)
                    sVal = val;
                }

                // Clamp
                sVal = clamp(sVal, 0.0, 1.0);

                // Map to Color
                return textureSample(colormapTexture, colormapSampler, vec2<f32>(sVal, 0.5));
            }
        `;

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: vertWGSL }),
                entryPoint: 'main',
            },
            fragment: {
                module: this.device.createShaderModule({ code: fragWGSL }),
                entryPoint: 'main',
                targets: [{ format: this.presentationFormat }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });

        this.sampler = this.device.createSampler({
            magFilter: hasFloat32Filterable ? 'linear' : 'nearest',
            minFilter: hasFloat32Filterable ? 'linear' : 'nearest',
            addressModeU: 'repeat', // Wrap Phi
            addressModeV: 'clamp-to-edge', // Clamp Theta
        });

        // Colormap Sampler (Always linear/clamp)
        this.colormapSampler = this.device.createSampler({
             magFilter: 'linear',
             minFilter: 'linear',
             addressModeU: 'clamp-to-edge',
             addressModeV: 'clamp-to-edge',
        });

        // Uniform Buffer
        this.uniformBuffer = this.device.createBuffer({
            size: 16, // 3 floats (width, height, scale) -> 12 bytes. Aligned to 16.
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    render(magnitudesGrid, width, height, scaleType) {
        if (!this.device || !this.pipeline) return;

        // flatten data if needed (expecting array of arrays or flat)
        // Check input format
        let dataFlat;
        if (Array.isArray(magnitudesGrid) && Array.isArray(magnitudesGrid[0])) {
            // It's a 2D array [Theta][Phi]
            const rows = magnitudesGrid.length;
            const cols = magnitudesGrid[0].length;
            dataFlat = new Float32Array(rows * cols);
            for(let i=0; i<rows; i++) {
                dataFlat.set(magnitudesGrid[i], i*cols);
            }
            // Update dims if different
            // width arg passed in is usually CANVAS width, not Data width.
            // But we need Data Dims for texture.
            // Wait, we need to recreate texture if Data Dims change.
        } else {
             // Assume flat
             dataFlat = magnitudesGrid instanceof Float32Array ? magnitudesGrid : new Float32Array(magnitudesGrid);
        }

        // Infer Data Dimensions (Texture Size)
        // We need to know the grid size.
        // beam_pattern.js passes `magnitudes_grid_linear_normalized`.
        // cachedCalculationResult3D.magnitudes_grid_linear_normalized is Array[Theta][Phi].
        const dataRows = magnitudesGrid.length;
        const dataCols = magnitudesGrid[0].length;

        // Check if texture needs update
        if (!this.dataTexture || this.dataTexture.width !== dataCols || this.dataTexture.height !== dataRows) {
            if (this.dataTexture) this.dataTexture.destroy();
            this.dataTexture = this.device.createTexture({
                size: [dataCols, dataRows, 1],
                format: 'r32float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
        }

        // Upload Data
        this.device.queue.writeTexture(
            { texture: this.dataTexture },
            dataFlat,
            { bytesPerRow: dataCols * 4 },
            { width: dataCols, height: dataRows }
        );

        // Update Uniforms
        // Map scaleType string to int
        let sTypeInt = 0;
        if (scaleType === 'dB') sTypeInt = 1;
        else if (scaleType === 'sqrt') sTypeInt = 2;
        else if (scaleType === 'quadratic') sTypeInt = 3;
        else if (scaleType === 'fourth_root') sTypeInt = 4;

        // Canvas Dimensions
        const canvasWidth = this.context.canvas.width;
        const canvasHeight = this.context.canvas.height;

        const uniformData = new Float32Array([canvasWidth, canvasHeight, sTypeInt]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        // Create Bind Group
        const bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.dataTexture.createView() },
                { binding: 2, resource: this.colormapSampler },
                { binding: 3, resource: this.colormapTexture.createView() },
                { binding: 4, resource: { buffer: this.uniformBuffer } },
            ],
        });

        // Encode Render Pass
        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(4);
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}
