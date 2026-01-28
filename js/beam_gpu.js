/**
 * beam_gpu.js
 *
 * WebGPU implementation for Beam Pattern calculation.
 * Calculates the Array Factor and element pattern multiplication on the GPU.
 */

class BeamCalculatorGPU {
    constructor() {
        this.device = null;
        this.pipeline = null;
        this.bindGroupLayout = null;

        // Buffer caching for performance
        this.cachedAntennaBuffer = null;
        this.cachedAntennaSignature = null;
        this.cachedElementBuffer = null;
        this.cachedElementSignature = null;
        this.cachedElementCount = 0;
    }

    async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported in this environment.");
        }

        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance"
        });

        if (!adapter) {
            throw new Error("No WebGPU adapter found.");
        }

        this.device = await adapter.requestDevice();
        this.initPipeline();
    }

    initPipeline() {
        const shaderModule = this.device.createShaderModule({
            code: this.getShaderCode()
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // Antennas
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // Element Data
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },           // Output
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }            // Uniforms
            ]
        });

        this.pipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: {
                module: shaderModule,
                entryPoint: "main"
            }
        });
    }

    getShaderCode() {
        return `
            struct Complex {
                re: f32,
                im: f32,
            }

            struct ElementData {
                phi_deg: f32,
                theta_deg: f32,
                rETheta_re: f32,
                rETheta_im: f32,
                rEPhi_re: f32,
                rEPhi_im: f32,
            }

            @group(0) @binding(0) var<storage, read> antennas : array<vec2<f32>>;
            @group(0) @binding(1) var<storage, read> elementData : array<ElementData>;
            @group(0) @binding(2) var<storage, read_write> output : array<f32>;

            struct Uniforms {
                k: f32,
                numAntennas: u32,
            }
            @group(0) @binding(3) var<uniform> uniforms : Uniforms;

            const DEG_TO_RAD: f32 = 0.01745329252;

            fn multiply(a: Complex, b: Complex) -> Complex {
                return Complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
            }

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&elementData)) {
                    return;
                }

                let data = elementData[index];
                let theta_rad = data.theta_deg * DEG_TO_RAD;
                let phi_rad = data.phi_deg * DEG_TO_RAD;

                // Observation vector (u, v in antenna plane z=0)
                let u = sin(theta_rad) * cos(phi_rad);
                let v = sin(theta_rad) * sin(phi_rad);

                // Assuming scan direction is zenith (0,0) so scanVec = (0,0)
                // k_diff = k * (obsVec - scanVec) = k * obsVec
                let k_diffX = uniforms.k * u;
                let k_diffY = uniforms.k * v;

                var af_sum_re = 0.0;
                var af_sum_im = 0.0;

                for (var i: u32 = 0u; i < uniforms.numAntennas; i = i + 1u) {
                    let ant = antennas[i];
                    let phase = k_diffX * ant.x + k_diffY * ant.y;
                    let c = cos(phase);
                    let s = sin(phase);
                    af_sum_re = af_sum_re + c;
                    af_sum_im = af_sum_im + s;
                }

                let af_sum = Complex(af_sum_re, af_sum_im);

                let rETheta = Complex(data.rETheta_re, data.rETheta_im);
                let rEPhi = Complex(data.rEPhi_re, data.rEPhi_im);

                // Total Field = ElementPattern * ArrayFactor
                let totalTheta = multiply(rETheta, af_sum);
                let totalPhi = multiply(rEPhi, af_sum);

                // Magnitude Squared = |Theta|^2 + |Phi|^2
                let magSq = totalTheta.re * totalTheta.re + totalTheta.im * totalTheta.im +
                            totalPhi.re * totalPhi.re + totalPhi.im * totalPhi.im;

                output[index] = sqrt(magSq);
            }
        `;
    }

    async compute(antennaCoords, elementFieldData3D, k) {
        if (!this.device) await this.init();

        const numAntennas = antennaCoords.length;
        const numPoints = elementFieldData3D.length;

        // 1. Create or reuse Antenna Buffer (cached)
        const antennaSignature = numAntennas + "_" + (antennaCoords[0] ? antennaCoords[0].join(',') : "empty");
        let antennaBuffer;

        if (this.cachedAntennaBuffer && this.cachedAntennaSignature === antennaSignature) {
            // Reuse cached buffer
            antennaBuffer = this.cachedAntennaBuffer;
        } else {
            // Create new buffer
            const antennaData = new Float32Array(numAntennas * 2);
            for (let i = 0; i < numAntennas; i++) {
                antennaData[i * 2] = antennaCoords[i][0];
                antennaData[i * 2 + 1] = antennaCoords[i][1];
            }

            // Destroy old buffer if exists
            if (this.cachedAntennaBuffer) {
                this.cachedAntennaBuffer.destroy();
            }

            antennaBuffer = this.createBuffer(antennaData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            this.cachedAntennaBuffer = antennaBuffer;
            this.cachedAntennaSignature = antennaSignature;
        }

        // 2. Create or reuse Element Data Buffer (cached)
        // Element data is typically constant for the same element pattern
        const elementSignature = numPoints + "_" + (elementFieldData3D[0] ? elementFieldData3D[0].theta_deg : "empty");
        let elementBuffer;

        if (this.cachedElementBuffer && this.cachedElementSignature === elementSignature && this.cachedElementCount === numPoints) {
            // Reuse cached buffer
            elementBuffer = this.cachedElementBuffer;
        } else {
            // Create new buffer
            const elementDataFlat = new Float32Array(numPoints * 6);
            for (let i = 0; i < numPoints; i++) {
                const p = elementFieldData3D[i];
                const base = i * 6;
                elementDataFlat[base] = p.phi_deg;
                elementDataFlat[base + 1] = p.theta_deg;
                elementDataFlat[base + 2] = p.rETheta.re;
                elementDataFlat[base + 3] = p.rETheta.im;
                elementDataFlat[base + 4] = p.rEPhi.re;
                elementDataFlat[base + 5] = p.rEPhi.im;
            }

            // Destroy old buffer if exists
            if (this.cachedElementBuffer) {
                this.cachedElementBuffer.destroy();
            }

            elementBuffer = this.createBuffer(elementDataFlat, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            this.cachedElementBuffer = elementBuffer;
            this.cachedElementSignature = elementSignature;
            this.cachedElementCount = numPoints;
        }

        // 3. Output Buffer
        const outputBufferSize = numPoints * 4; // 1 float per point
        const outputBuffer = this.device.createBuffer({
            size: outputBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        // 4. Uniforms
        const uniformData = new Float32Array([k]); // k is float

        // Let's make a buffer of 2x 32bit.
        const uniformBufferData = new ArrayBuffer(16); // 16 bytes min uniform size usually? No, but alignment 16 is common.
        const uniformViewF32 = new Float32Array(uniformBufferData);
        const uniformViewU32 = new Uint32Array(uniformBufferData);
        uniformViewF32[0] = k;
        uniformViewU32[1] = numAntennas; // at offset 4

        const uniformBuffer = this.createBuffer(uniformBufferData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        // 5. Bind Group
        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: antennaBuffer } },
                { binding: 1, resource: { buffer: elementBuffer } },
                { binding: 2, resource: { buffer: outputBuffer } },
                { binding: 3, resource: { buffer: uniformBuffer } }
            ]
        });

        // 6. Encode Commands
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        const workgroupSize = 64;
        const numWorkgroups = Math.ceil(numPoints / workgroupSize);
        passEncoder.dispatchWorkgroups(numWorkgroups);
        passEncoder.end();

        // 7. Readback
        const readBuffer = this.device.createBuffer({
            size: outputBufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBufferSize);

        this.device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const resultOriginal = new Float32Array(readBuffer.getMappedRange());
        const result = new Float32Array(resultOriginal); // Copy because unmap invalidates
        readBuffer.unmap();

        return result;
    }

    createBuffer(data, usage) {
        // Handle alignment padding if necessary (Uniforms often need 16 byte align)
        // For Storage, usually 4 byte is fine.
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: usage,
            mappedAtCreation: true
        });

        // Copy data
        if (data instanceof Float32Array) {
            new Float32Array(buffer.getMappedRange()).set(data);
        } else if (data instanceof ArrayBuffer) {
            new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data));
        } else {
            // Assuming ArrayBufferView
            new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        }

        buffer.unmap();
        return buffer;
    }
}
