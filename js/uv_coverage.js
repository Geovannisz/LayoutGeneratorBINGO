/**
 * uv_coverage.js
 *
 * @fileoverview Módulo de simulação e visualização da cobertura UV para o BINGO Layout Generator.
 * Calcula coordenadas UV para todos os pares de estações (baselines) em função do ângulo horário
 * e plota a cobertura UV utilizando Plotly.js.
 *
 * @description Para cada par de estações, calcula componentes u,v a partir dos vetores de baseline
 * e parâmetros de observação (declinação, duração, frequência). Suporta exportação do gráfico
 * e cálculo automático da resolução angular (θ ≈ λ/D_max).
 *
 * @requires BingoConstants
 * @requires Plotly
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

class UVCoverageSimulator {
    constructor() {
        // IDs dos elementos da UI
        this.decInputId = 'uv-dec-input';
        this.durationInputId = 'uv-duration-input';
        this.timestepsInputId = 'uv-timesteps-input';
        this.freqInputId = 'uv-freq-input';
        this.latitudeInputId = 'uv-latitude-input';
        this.generateBtnId = 'uv-generate-btn';
        this.plotContainerId = 'uv-plot-container';
        this.resolutionDisplayId = 'uv-resolution-display';
        this.exportBtnId = 'uv-export-btn';
        this.statusId = 'uv-status';

        // Referências aos elementos DOM
        this.decInput = document.getElementById(this.decInputId);
        this.durationInput = document.getElementById(this.durationInputId);
        this.timestepsInput = document.getElementById(this.timestepsInputId);
        this.freqInput = document.getElementById(this.freqInputId);
        this.latitudeInput = document.getElementById(this.latitudeInputId);
        this.generateBtn = document.getElementById(this.generateBtnId);
        this.plotContainer = document.getElementById(this.plotContainerId);
        this.resolutionDisplay = document.getElementById(this.resolutionDisplayId);
        this.exportBtn = document.getElementById(this.exportBtnId);
        this.statusDisplay = document.getElementById(this.statusId);

        // Parâmetros padrão
        this.defaultDec = -7.04;
        this.defaultDuration = 4;
        this.defaultTimesteps = 60;
        this.defaultFreqMHz = (BingoConstants.FREQUENCY_HZ / 1e6);
        this.defaultLatitude = BingoConstants.BINGO_LATITUDE;

        // Dados UV armazenados
        this.uvData = null;

        // WebGPU: tenta inicializar se disponível
        this.gpuDevice = null;
        this.gpuAvailable = false;
        this._initWebGPU();

        this._initUI();
        this._bindEvents();

        console.log("UVCoverageSimulator: Módulo de cobertura UV inicializado.");
    }

    /**
     * Tenta inicializar WebGPU para aceleração de hardware.
     * Se não disponível, usa CPU como fallback silencioso.
     * @private
     */
    async _initWebGPU() {
        try {
            if (!navigator.gpu) {
                console.log("UVCoverageSimulator: WebGPU não disponível, usando CPU.");
                return;
            }
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.log("UVCoverageSimulator: WebGPU adapter não encontrado, usando CPU.");
                return;
            }
            this.gpuDevice = await adapter.requestDevice();
            this.gpuAvailable = true;
            console.log("UVCoverageSimulator: WebGPU inicializado com sucesso — aceleração de hardware ativa.");
        } catch (err) {
            console.log("UVCoverageSimulator: WebGPU falhou, usando CPU:", err.message);
        }
    }

    /**
     * Inicializa valores padrão nos campos da UI.
     * @private
     */
    _initUI() {
        if (this.decInput) this.decInput.value = this.defaultDec;
        if (this.durationInput) this.durationInput.value = this.defaultDuration;
        if (this.timestepsInput) this.timestepsInput.value = this.defaultTimesteps;
        if (this.freqInput) this.freqInput.value = this.defaultFreqMHz;
        if (this.latitudeInput) this.latitudeInput.value = this.defaultLatitude;
    }

    /**
     * Vincula eventos aos elementos da UI e escuta eventos globais.
     * @private
     */
    _bindEvents() {
        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.generateUVCoverage());
        }
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportPlot('png'));
        }

        // Escuta evento de estações geradas para atualização automática
        window.addEventListener('stationsGenerated', () => {
            const uvTab = document.querySelector('.tab-button[data-tab="uv-coverage"]') ||
                          document.querySelector('[data-tab="uv-coverage"]');
            const isActive = uvTab && uvTab.classList.contains('active');
            if (isActive) {
                console.log("UVCoverageSimulator: Evento 'stationsGenerated' recebido. Atualizando cobertura UV.");
                this.generateUVCoverage();
            }
        });
    }

    /**
     * Obtém as posições atuais das estações.
     * @returns {Array<{x: number, y: number}>} Array de posições de estações.
     */
    getStationPositions() {
        if (window.stationManager && typeof window.stationManager.getStationPositions === 'function') {
            return window.stationManager.getStationPositions();
        }
        if (window.interactiveMap && typeof window.interactiveMap.getStationPositions === 'function') {
            return window.interactiveMap.getStationPositions();
        }
        console.warn("UVCoverageSimulator: Nenhuma fonte de posições de estações encontrada.");
        return [];
    }

    /**
     * Lê os parâmetros de observação da UI ou retorna valores padrão.
     * @returns {{dec: number, duration: number, timesteps: number, freqHz: number, latitude: number}}
     * @private
     */
    _readParams() {
        const dec = this.decInput ? parseFloat(this.decInput.value) : this.defaultDec;
        const duration = this.durationInput ? parseFloat(this.durationInput.value) : this.defaultDuration;
        const timesteps = this.timestepsInput ? parseInt(this.timestepsInput.value, 10) : this.defaultTimesteps;
        const freqMHz = this.freqInput ? parseFloat(this.freqInput.value) : this.defaultFreqMHz;
        const latitude = this.latitudeInput ? parseFloat(this.latitudeInput.value) : this.defaultLatitude;

        return {
            dec: isNaN(dec) ? this.defaultDec : dec,
            duration: isNaN(duration) ? this.defaultDuration : duration,
            timesteps: isNaN(timesteps) || timesteps < 1 ? this.defaultTimesteps : timesteps,
            freqHz: isNaN(freqMHz) ? BingoConstants.FREQUENCY_HZ : freqMHz * 1e6,
            latitude: isNaN(latitude) ? this.defaultLatitude : latitude
        };
    }

    /**
     * Calcula a cobertura UV para todos os pares de estações e passos de tempo.
     * Tenta usar WebGPU se disponível para aceleração; caso contrário, usa CPU.
     *
     * u = Bx*sin(H) + By*cos(H)
     * v = -Bx*sin(dec)*cos(H) + By*sin(dec)*sin(H) + Bz*cos(dec)
     *
     * Bx, By são componentes do baseline no plano local (Bz = 0 para estações coplanares).
     * Coordenadas em comprimentos de onda: u_λ = u/λ, v_λ = v/λ.
     */
    async generateUVCoverage() {
        const stations = this.getStationPositions();
        if (!stations || stations.length < 2) {
            this.updateStatus("Erro: São necessárias pelo menos 2 estações para calcular a cobertura UV.");
            console.error("UVCoverageSimulator: Número insuficiente de estações.");
            return;
        }

        this.updateStatus("Calculando cobertura UV...");

        const params = this._readParams();
        const decRad = params.dec * BingoConstants.DEG_TO_RAD;
        const lambda = BingoConstants.SPEED_OF_LIGHT / params.freqHz;
        const sinDec = Math.sin(decRad);
        const cosDec = Math.cos(decRad);

        // Ângulos horários: centrados em 0, de -duration/2 a +duration/2
        const halfDuration = params.duration / 2;
        const hourAngles = [];
        for (let i = 0; i < params.timesteps; i++) {
            const hHours = params.timesteps === 1 ? 0 : -halfDuration + (params.duration * i) / (params.timesteps - 1);
            hourAngles.push(hHours * 15 * BingoConstants.DEG_TO_RAD);
        }

        let uvResult;

        // Tenta usar WebGPU para cálculos massivos
        if (this.gpuAvailable && this.gpuDevice && stations.length >= 10) {
            try {
                this.updateStatus("Calculando cobertura UV (WebGPU)...");
                uvResult = await this._computeUVonGPU(stations, hourAngles, sinDec, cosDec, lambda);
                this.updateStatus(`Cobertura UV gerada via GPU: ${uvResult.nBaselines} baselines, ${uvResult.uPoints.length} pontos.`);
            } catch (gpuErr) {
                console.warn("UVCoverageSimulator: WebGPU falhou, usando CPU:", gpuErr.message);
                uvResult = this._computeUVonCPU(stations, hourAngles, sinDec, cosDec, lambda);
            }
        } else {
            uvResult = this._computeUVonCPU(stations, hourAngles, sinDec, cosDec, lambda);
        }

        this.uvData = { ...uvResult, lambda, params };

        const accel = (this.gpuAvailable && stations.length >= 10) ? 'GPU' : 'CPU';
        console.log(`UVCoverageSimulator [${accel}]: ${uvResult.nBaselines} baselines, ${uvResult.uPoints.length} pontos UV.`);

        this.plotUVCoverage(this.uvData);
        this.calculateResolution();
        if (!this.uvData._statusSet) {
            this.updateStatus(`Cobertura UV gerada (${accel}): ${uvResult.nBaselines} baselines, ${uvResult.uPoints.length} pontos.`);
        }
    }

    /**
     * Calcula UV coverage na CPU (fallback padrão).
     * @private
     */
    _computeUVonCPU(stations, hourAngles, sinDec, cosDec, lambda) {
        const uPoints = [];
        const vPoints = [];
        const baselineLengths = [];
        let maxBaseline = 0;
        const nStations = stations.length;

        for (let i = 0; i < nStations; i++) {
            for (let j = i + 1; j < nStations; j++) {
                const Bx = stations[j].x - stations[i].x;
                const By = stations[j].y - stations[i].y;
                const bLen = Math.sqrt(Bx * Bx + By * By);
                if (bLen > maxBaseline) maxBaseline = bLen;

                for (let t = 0; t < hourAngles.length; t++) {
                    const H = hourAngles[t];
                    const sinH = Math.sin(H);
                    const cosH = Math.cos(H);

                    const u = Bx * sinH + By * cosH;
                    const v = -Bx * sinDec * cosH + By * sinDec * sinH;

                    const uLambda = u / lambda;
                    const vLambda = v / lambda;

                    uPoints.push(uLambda);
                    vPoints.push(vLambda);
                    baselineLengths.push(bLen);

                    uPoints.push(-uLambda);
                    vPoints.push(-vLambda);
                    baselineLengths.push(bLen);
                }
            }
        }

        const nBaselines = (nStations * (nStations - 1)) / 2;
        return { uPoints, vPoints, baselineLengths, maxBaseline, nBaselines };
    }

    /**
     * Calcula UV coverage usando WebGPU compute shader.
     * @private
     */
    async _computeUVonGPU(stations, hourAngles, sinDec, cosDec, lambda) {
        const device = this.gpuDevice;
        const nStations = stations.length;
        const nBaselines = (nStations * (nStations - 1)) / 2;
        const nTimesteps = hourAngles.length;
        const nOutputPoints = nBaselines * nTimesteps * 2; // ×2 for conjugate

        // Prepare baseline pairs and hour angles
        const baselinePairs = new Float32Array(nBaselines * 2); // Bx, By per pair
        let bIdx = 0;
        for (let i = 0; i < nStations; i++) {
            for (let j = i + 1; j < nStations; j++) {
                baselinePairs[bIdx++] = stations[j].x - stations[i].x;
                baselinePairs[bIdx++] = stations[j].y - stations[i].y;
            }
        }

        const hourAngleArray = new Float32Array(hourAngles);

        // Uniform data: sinDec, cosDec, lambda, nTimesteps, nBaselines
        const uniformData = new Float32Array([sinDec, cosDec, lambda, nTimesteps, nBaselines]);

        // Create GPU buffers
        const baselinesBuffer = device.createBuffer({
            size: baselinePairs.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(baselinesBuffer, 0, baselinePairs);

        const hourAnglesBuffer = device.createBuffer({
            size: hourAngleArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(hourAnglesBuffer, 0, hourAngleArray);

        const uniformBuffer = device.createBuffer({
            size: uniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        // Output: u, v, baselineLength per point (×2 for conjugate)
        const outputSize = nOutputPoints * 3 * 4; // 3 floats × 4 bytes each
        const outputBuffer = device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        const readBuffer = device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });

        // WGSL shader
        const shaderCode = `
            struct Uniforms {
                sinDec: f32,
                cosDec: f32,
                lambda: f32,
                nTimesteps: f32,
                nBaselines: f32,
            };

            @group(0) @binding(0) var<storage, read> baselines: array<f32>;
            @group(0) @binding(1) var<storage, read> hourAngles: array<f32>;
            @group(0) @binding(2) var<uniform> uniforms: Uniforms;
            @group(0) @binding(3) var<storage, read_write> output: array<f32>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                let nTimesteps = u32(uniforms.nTimesteps);
                let nBaselines = u32(uniforms.nBaselines);
                let totalWork = nBaselines * nTimesteps;
                let idx = gid.x;
                if (idx >= totalWork) { return; }

                let bIdx = idx / nTimesteps;
                let tIdx = idx % nTimesteps;

                let Bx = baselines[bIdx * 2u];
                let By = baselines[bIdx * 2u + 1u];
                let bLen = sqrt(Bx * Bx + By * By);

                let H = hourAngles[tIdx];
                let sinH = sin(H);
                let cosH = cos(H);

                let u = Bx * sinH + By * cosH;
                let v = -Bx * uniforms.sinDec * cosH + By * uniforms.sinDec * sinH;

                let uLam = u / uniforms.lambda;
                let vLam = v / uniforms.lambda;

                // Original point
                let outIdx = idx * 6u; // 2 points × 3 values
                output[outIdx] = uLam;
                output[outIdx + 1u] = vLam;
                output[outIdx + 2u] = bLen;

                // Conjugate point
                output[outIdx + 3u] = -uLam;
                output[outIdx + 4u] = -vLam;
                output[outIdx + 5u] = bLen;
            }
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
            ]
        });

        const pipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: baselinesBuffer } },
                { binding: 1, resource: { buffer: hourAnglesBuffer } },
                { binding: 2, resource: { buffer: uniformBuffer } },
                { binding: 3, resource: { buffer: outputBuffer } }
            ]
        });

        const totalWork = nBaselines * nTimesteps;
        const workgroupSize = 64;
        const numWorkgroups = Math.ceil(totalWork / workgroupSize);

        const commandEncoder = device.createCommandEncoder();
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(numWorkgroups);
        pass.end();

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputSize);
        device.queue.submit([commandEncoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();

        // Parse output
        const uPoints = [];
        const vPoints = [];
        const baselineLengths = [];
        let maxBaseline = 0;

        for (let i = 0; i < nOutputPoints; i++) {
            const offset = i * 3;
            uPoints.push(resultData[offset]);
            vPoints.push(resultData[offset + 1]);
            const bLen = resultData[offset + 2];
            baselineLengths.push(bLen);
            if (bLen > maxBaseline) maxBaseline = bLen;
        }

        // Cleanup GPU buffers
        baselinesBuffer.destroy();
        hourAnglesBuffer.destroy();
        uniformBuffer.destroy();
        outputBuffer.destroy();
        readBuffer.destroy();

        return { uPoints, vPoints, baselineLengths, maxBaseline, nBaselines };
    }

    /**
     * Plota a cobertura UV usando Plotly.js com mapa de cores por comprimento de baseline.
     * @param {Object} uvData - Dados UV calculados.
     * @param {number[]} uvData.uPoints - Coordenadas u em comprimentos de onda.
     * @param {number[]} uvData.vPoints - Coordenadas v em comprimentos de onda.
     * @param {number[]} uvData.baselineLengths - Comprimento de cada baseline (metros).
     * @param {number} uvData.maxBaseline - Baseline máxima (metros).
     * @param {number} uvData.lambda - Comprimento de onda (metros).
     */
    plotUVCoverage(uvData) {
        if (!this.plotContainer) {
            console.warn("UVCoverageSimulator: Contêiner do gráfico não encontrado.");
            return;
        }
        if (typeof Plotly === 'undefined') {
            console.error("UVCoverageSimulator: Plotly.js não está carregado.");
            this.updateStatus("Erro: Plotly.js não encontrado.");
            return;
        }

        const { uPoints, vPoints, baselineLengths, maxBaseline, lambda } = uvData;

        const resArcmin = maxBaseline > 0
            ? (lambda / maxBaseline) * BingoConstants.RAD_TO_DEG * 60
            : 0;

        // Calcula limites dos eixos a partir dos extremos dos dados × 1.1
        let uMax = 0, vMax = 0;
        for (let i = 0; i < uPoints.length; i++) {
            const au = Math.abs(uPoints[i]);
            const av = Math.abs(vPoints[i]);
            if (au > uMax) uMax = au;
            if (av > vMax) vMax = av;
        }
        const uLimit = uMax * 1.1 || 1;
        const vLimit = vMax * 1.1 || 1;

        const trace = {
            x: uPoints,
            y: vPoints,
            mode: 'markers',
            type: 'scatter',
            marker: {
                size: 2,
                color: baselineLengths,
                colorscale: [
                    [0, 'rgb(0,0,255)'],
                    [0.5, 'rgb(0,200,0)'],
                    [1, 'rgb(255,0,0)']
                ],
                colorbar: {
                    title: 'Baseline (m)',
                    titleside: 'right'
                },
                opacity: 0.6
            },
            hovertemplate: 'u: %{x:.1f} λ<br>v: %{y:.1f} λ<br>Baseline: %{marker.color:.1f} m<extra></extra>'
        };

        const layout = {
            title: 'Cobertura UV',
            xaxis: {
                title: 'u (comprimentos de onda)',
                range: [-uLimit, uLimit],
                zeroline: true,
                zerolinecolor: '#888',
                constrain: 'range'
            },
            yaxis: {
                title: 'v (comprimentos de onda)',
                range: [-vLimit, vLimit],
                zeroline: true,
                zerolinecolor: '#888',
                constrain: 'range'
            },
            dragmode: 'zoom',
            hovermode: 'closest',
            plot_bgcolor: '#1a1a2e',
            paper_bgcolor: '#16213e',
            font: { color: '#e0e0e0' },
            annotations: [{
                x: 0.02,
                y: 0.98,
                xref: 'paper',
                yref: 'paper',
                text: `Baseline máx: ${maxBaseline.toFixed(1)} m | Resolução: ${resArcmin.toFixed(2)} arcmin`,
                showarrow: false,
                font: { size: 11, color: '#aaa' },
                bgcolor: 'rgba(0,0,0,0.5)',
                borderpad: 4
            }],
            margin: { t: 50, b: 60, l: 60, r: 20 },
            autosize: true
        };

        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };

        Plotly.newPlot(this.plotContainer, [trace], layout, config);
    }

    /**
     * Calcula e exibe a resolução angular a partir da baseline máxima.
     * θ ≈ λ / D_max (em radianos), convertido para arcminutos.
     */
    calculateResolution() {
        if (!this.uvData || this.uvData.maxBaseline <= 0) {
            if (this.resolutionDisplay) {
                this.resolutionDisplay.textContent = 'Resolução: N/A';
            }
            return;
        }

        const { maxBaseline, lambda } = this.uvData;
        const thetaRad = lambda / maxBaseline;
        const thetaDeg = thetaRad * BingoConstants.RAD_TO_DEG;
        const thetaArcmin = thetaDeg * 60;
        const thetaArcsec = thetaArcmin * 60;

        let displayText;
        if (thetaArcmin >= 1) {
            displayText = `Resolução angular: ${thetaArcmin.toFixed(2)} arcmin (θ ≈ λ/D_max)`;
        } else {
            displayText = `Resolução angular: ${thetaArcsec.toFixed(2)} arcsec (θ ≈ λ/D_max)`;
        }

        if (this.resolutionDisplay) {
            this.resolutionDisplay.textContent = displayText;
        }

        console.log(`UVCoverageSimulator: Baseline máx = ${maxBaseline.toFixed(2)} m, λ = ${lambda.toFixed(4)} m, resolução = ${thetaArcmin.toFixed(4)} arcmin.`);
    }

    /**
     * Exporta o gráfico UV como imagem PNG ou SVG.
     * @param {string} [format='png'] - Formato de exportação ('png' ou 'svg').
     */
    exportPlot(format = 'png') {
        if (!this.plotContainer) {
            this.updateStatus("Erro: Contêiner do gráfico não encontrado para exportação.");
            return;
        }
        if (typeof Plotly === 'undefined') {
            this.updateStatus("Erro: Plotly.js não encontrado.");
            return;
        }

        const validFormat = (format === 'svg') ? 'svg' : 'png';

        Plotly.downloadImage(this.plotContainer, {
            format: validFormat,
            width: 1200,
            height: 1000,
            filename: `bingo_uv_coverage_${Date.now()}`
        }).then(() => {
            this.updateStatus(`Gráfico UV exportado como ${validFormat.toUpperCase()}.`);
            console.log(`UVCoverageSimulator: Gráfico exportado como ${validFormat.toUpperCase()}.`);
        }).catch((err) => {
            this.updateStatus("Erro ao exportar gráfico UV.");
            console.error("UVCoverageSimulator: Erro na exportação:", err);
        });
    }

    /**
     * Atualiza a mensagem de status na UI.
     * @param {string} msg - Mensagem de status.
     */
    updateStatus(msg) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = msg;
        }
    }
}

// Inicialização e exposição global
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.uvCoverageSimulator) {
            window.uvCoverageSimulator = new UVCoverageSimulator();
        }
    });
}
