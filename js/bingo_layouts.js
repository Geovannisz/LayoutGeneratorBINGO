/**
 * bingo_layouts.js
 *
 * Biblioteca JavaScript para gerar layouts de centros de tiles para estações BINGO.
 * Foco na geração das coordenadas relativas (X, Y) dos centros dos tiles.
 *
 * Modificações Recentes:
 * - Remoção dos parâmetros 'spacingMode' e 'centerScaleMode'.
 * - O escalonamento (linear vs. exponencial central) é agora controlado
 *   pelo parâmetro 'centerExpScaleFactor'. Um valor de 1.0 para
 *   'centerExpScaleFactor' resulta em espaçamento linear (ou seja, sem
 *   escalonamento exponencial adicional), enquanto valores > 1.0 expandem
 *   e < 1.0 contraem exponencialmente a partir do centro.
 * - A checagem de colisão para posicionamento com offset aleatório
 *   foi padronizada para usar uma abordagem retangular simples baseada
 *   nas dimensões do tile e um fator de separação.
 */

// Constantes Globais
const COORD_PRECISION = 6; // Número de casas decimais para as coordenadas
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5)); // Ângulo dourado em radianos para Phyllotaxis
const DEFAULT_MAX_PLACEMENT_ATTEMPTS = 10000; // Tentativas padrão para posicionamento com offset e colisão

// === Funções Auxiliares ===

/**
 * Centraliza um conjunto de coordenadas [x, y] em torno da origem (0, 0).
 * @param {Array<Array<number>>} coords Array de coordenadas [[x1, y1], [x2, y2], ...].
 * @returns {Array<Array<number>>} Array de coordenadas centralizadas.
 */
function centerCoords(coords) {
    if (!coords || coords.length === 0) return [];
    let sumX = 0, sumY = 0;
    for (const coord of coords) {
        sumX += coord[0];
        sumY += coord[1];
    }
    const centerX = sumX / coords.length;
    const centerY = sumY / coords.length;
    return coords.map(coord => [
        parseFloat((coord[0] - centerX).toFixed(COORD_PRECISION)),
        parseFloat((coord[1] - centerY).toFixed(COORD_PRECISION))
    ]);
}

/**
 * Aplica um escalonamento exponencial radial a partir do centro (0,0).
 * Pontos mais distantes do centro são escalonados mais intensamente se expScaleFactor != 1.
 * @param {Array<Array<number>>} coords Coordenadas a serem escalonadas (devem estar centradas se desejado).
 * @param {number} expScaleFactor Fator de escalonamento base.
 *                                  - 1.0: Sem escalonamento exponencial (comportamento linear).
 *                                  - >1.0: Expande exponencialmente a partir do centro.
 *                                  - <1.0 (e >0): Contrai exponencialmente em direção ao centro.
 * @returns {Array<Array<number>>} Coordenadas com escalonamento aplicado.
 */
function applyCenterExponentialScaling(coords, expScaleFactor) {
    if (!coords || coords.length === 0 || typeof expScaleFactor !== 'number' || expScaleFactor <= 0 || expScaleFactor === 1.0) {
        // Retorna original se não houver scaling a aplicar ou se o fator for inválido/neutro.
        return coords;
    }

    // Calcula a distância de cada ponto à origem.
    const distances = coords.map(coord => Math.sqrt(coord[0]**2 + coord[1]**2));
    // Filtra distâncias não nulas para evitar divisão por zero se todas forem zero.
    const nonZeroDistances = distances.filter(d => d > 1e-9);
    if (nonZeroDistances.length === 0) return coords; // Todos os pontos na origem.

    // Usa a distância média (dos pontos não nulos) como referência para o expoente.
    // Isso ajuda a normalizar o efeito do escalonamento.
    const refDistance = nonZeroDistances.reduce((a, b) => a + b, 0) / nonZeroDistances.length;
    if (refDistance < 1e-9) return coords; // Distância de referência muito pequena.

    return coords.map((coord, i) => {
        const dist = distances[i];
        if (dist < 1e-9) return coord; // Não escala o ponto central.

        const exponent = dist / refDistance; // O quão "longe" está o ponto, relativo à média.
        const scaleFactorPow = Math.pow(expScaleFactor, exponent); // Efeito exponencial.

        return [
            parseFloat((coord[0] * scaleFactorPow).toFixed(COORD_PRECISION)),
            parseFloat((coord[1] * scaleFactorPow).toFixed(COORD_PRECISION))
        ];
    });
}

/**
 * Tenta posicionar um tile com um offset aleatório (distribuição próxima à normal),
 * verificando colisões retangulares com tiles já posicionados.
 * @param {number} baseX Coordenada X base antes do offset.
 * @param {number} baseY Coordenada Y base antes do offset.
 * @param {number} offsetStddevM Desvio padrão do offset aleatório em metros.
 * @param {Array<Array<number>>} placedCoords Coordenadas [[x,y]] dos tiles já posicionados.
 * @param {number} tileWidthM Largura do tile em metros.
 * @param {number} tileHeightM Altura do tile em metros.
 * @param {number} minSeparationFactor Fator de separação mínima (1.0 = toque, >1.0 = com folga).
 * @param {number} maxAttempts Máximo de tentativas para encontrar uma posição sem colisão.
 * @returns {Array<number>|null} Coordenadas [x, y] válidas ou null se não encontrar posição.
 */
function placeWithRandomOffsetAndCollisionCheck(
    baseX, baseY, offsetStddevM, placedCoords,
    tileWidthM, tileHeightM, minSeparationFactor,
    maxAttempts
) {
    // Se não há offset, retorna a posição base.
    if (offsetStddevM <= 0) return [baseX, baseY];

    // Distâncias mínimas requeridas entre centros dos tiles para evitar sobreposição retangular.
    const minRequiredDistX = tileWidthM * minSeparationFactor;
    const minRequiredDistY = tileHeightM * minSeparationFactor;

    for (let i = 0; i < maxAttempts; i++) {
        // Gera offset aleatório usando o Teorema do Limite Central (soma de 6 uniformes -> aprox. normal)
        let offsetX = 0, offsetY = 0;
        for (let j = 0; j < 6; j++) { // Soma de 6 variáveis aleatórias uniformes
            offsetX += (Math.random() * 2 - 1); // Entre -1 e 1
            offsetY += (Math.random() * 2 - 1);
        }
        // Ajusta para ter o desvio padrão desejado (stddev de U(-1,1) é 1/sqrt(3), soma de 6 -> sqrt(6)*1/sqrt(3) = sqrt(2))
        // Multiplicador empírico para aproximar melhor o stddev desejado (2.45 ~ sqrt(6))
        offsetX = (offsetX / 6) * offsetStddevM * 2.449; // Média 0, stddev ~ offsetStddevM
        offsetY = (offsetY / 6) * offsetStddevM * 2.449;

        const candX = baseX + offsetX;
        const candY = baseY + offsetY;
        let collision = false;

        // Verifica colisão com todos os tiles já posicionados.
        for (const placed of placedCoords) {
            const deltaX = Math.abs(candX - placed[0]);
            const deltaY = Math.abs(candY - placed[1]);
            // Se a distância entre centros em X E Y for menor que o mínimo, há colisão.
            if (deltaX < minRequiredDistX && deltaY < minRequiredDistY) {
                collision = true;
                break;
            }
        }
        if (!collision) {
            return [candX, candY]; // Posição válida encontrada.
        }
    }
    return null; // Falhou em encontrar posição sem colisão após maxAttempts.
}


// === Funções Geradoras de Layout ===

/**
 * Cria um layout de grade retangular.
 * @param {number} numCols Número de colunas.
 * @param {number} numRows Número de linhas.
 * @param {number} tileWidthM Largura do tile (metros).
 * @param {number} tileHeightM Altura do tile (metros).
 * @param {number} spacingXFactor Fator de espaçamento em X (relativo à largura do tile).
 * @param {number} spacingYFactor Fator de espaçamento em Y (relativo à altura do tile).
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central (1.0 = linear).
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório (metros).
 * @param {number} minSeparationFactor Fator de separação mínima para checagem de colisão.
 * @param {number} maxPlacementAttempts Máximo de tentativas para posicionamento com offset.
 * @param {boolean} centerLayout Se true, centraliza o layout final na origem.
 * @returns {Array<Array<number>>} Array de coordenadas [x,y] dos centros dos tiles.
 */
function createGridLayout(
    numCols, numRows, tileWidthM, tileHeightM,
    spacingXFactor = 1.0, spacingYFactor = 1.0, centerExpScaleFactor = 1.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.0,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numCols <= 0 || numRows <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const spacingX = tileWidthM * spacingXFactor;
    const spacingY = tileHeightM * spacingYFactor;

    // Gera coordenadas base da grade, centradas na origem antes do scaling.
    const baseCoords = [];
    for (let i = 0; i < numCols; i++) {
        const xIndex = i - (numCols - 1) / 2.0; // Centraliza índice
        for (let j = 0; j < numRows; j++) {
            const yIndex = j - (numRows - 1) / 2.0; // Centraliza índice
            baseCoords.push([xIndex * spacingX, yIndex * spacingY]);
        }
    }

    // Aplica escalonamento exponencial. Se centerExpScaleFactor for 1.0, não há mudança.
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    // Posiciona com offset aleatório e checagem de colisão, se aplicável.
    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Grid: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, // Passa `finalCoords` para checar com já posicionados
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout Grid: ${skippedCount}/${scaledCoords.length} tiles pulados devido a colisões persistentes.`);
    } else {
        finalCoords.push(...scaledCoords); // Sem offset, usa coordenadas escaladas diretamente.
    }

    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Grid (${numCols}x${numRows}, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout em espiral.
 * @param {number} numArms Número de braços da espiral.
 * @param {number} tilesPerArm Número de tiles por braço.
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} radiusStartFactor Fator para o raio inicial (relativo à diagonal do tile).
 * @param {number} radiusStepFactor Fator para o incremento linear do raio por tile (relativo à diagonal).
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {number} angleStepRad Incremento angular por tile em um braço (radianos).
 * @param {number} armOffsetRad Offset angular inicial para o primeiro braço (radianos).
 * @param {number} rotationPerArmRad Rotação adicional aplicada a cada braço subsequente (radianos).
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @param {boolean} includeCenterTile Se true, adiciona um tile na origem.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createSpiralLayout(
    numArms, tilesPerArm, tileWidthM, tileHeightM,
    radiusStartFactor = 0.5, radiusStepFactor = 0.2, centerExpScaleFactor = 1.0,
    angleStepRad = Math.PI / 6, armOffsetRad = 0.0, rotationPerArmRad = 0.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true, includeCenterTile = false
) {
    if (numArms <= 0 || tilesPerArm <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const tileDiag = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const baseRadius = radiusStartFactor * tileDiag;
    const linearRadiusIncrement = radiusStepFactor * tileDiag; // Incremento linear antes do scaling

    const baseCoords = [];
    const seenCoordsTuples = new Set(); // Para evitar duplicatas exatas
    if (includeCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }

    for (let p = 0; p < numArms; p++) { // Itera sobre cada braço
        const currentArmAngle = p * (2 * Math.PI / numArms) + p * rotationPerArmRad + armOffsetRad;
        let currentRadius = baseRadius; // Raio inicial para este braço
        for (let i = 0; i < tilesPerArm; i++) { // Itera sobre tiles no braço
            const currentAngle = currentArmAngle + i * angleStepRad;
            const xBase = currentRadius * Math.cos(currentAngle);
            const yBase = currentRadius * Math.sin(currentAngle);
            const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordTuple);
            }
            currentRadius += linearRadiusIncrement; // Incrementa raio para próximo tile
        }
    }

    // Aplica scaling exponencial (se fator != 1.0)
    // Escala apenas os pontos que não são o centro (se incluído)
    const coordsToScale = includeCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                         ? baseCoords.slice(1)
                         : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = includeCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                       ? [baseCoords[0], ...scaledPart]
                       : scaledPart;

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Espiral: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        // Se houver tile central, tenta posicioná-lo primeiro sem checar colisão com ele mesmo.
        let startIndex = 0;
        if (includeCenterTile && scaledCoords.length > 0 && scaledCoords[0][0] === 0 && scaledCoords[0][1] === 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(
                scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], // Lista vazia de colocados
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1; // Começa a checar colisões a partir do próximo tile.
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout Espiral: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Espiral (${numArms} braços, ${tilesPerArm} t/braço, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros.`);
    return centeredCoords;
}


/**
 * Cria um layout em anéis concêntricos.
 * @param {number} numRings Número de anéis.
 * @param {Array<number>} tilesPerRing Array com o número de tiles para cada anel.
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} radiusStartFactor Fator para o raio do primeiro anel.
 * @param {number} radiusStepFactor Fator para o incremento linear do raio por anel.
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {number} angleOffsetRad Offset angular para o primeiro tile de cada anel (radianos).
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @param {boolean} addCenterTile Se true, adiciona um tile na origem.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createRingLayout(
    numRings, tilesPerRing, tileWidthM, tileHeightM,
    radiusStartFactor = 0.5, radiusStepFactor = 0.5, centerExpScaleFactor = 1.0,
    angleOffsetRad = 0.0, randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true, addCenterTile = true
) {
    if (numRings <= 0 || tileWidthM <= 0 || tileHeightM <= 0 || !Array.isArray(tilesPerRing)) return [];
    // Garante que tilesPerRing tenha o comprimento de numRings e valores válidos.
    if (tilesPerRing.length !== numRings) {
        tilesPerRing = Array.from({ length: numRings }, (_, i) => Math.max(1, 8 * (i + 1))); // Default: 8, 16, 24...
        console.warn(`createRingLayout: 'tilesPerRing' ajustado para ${numRings} anéis:`, tilesPerRing);
    } else {
         tilesPerRing = tilesPerRing.map(n => Math.max(1, parseInt(n) || 8)); // Garante pelo menos 1 tile, default 8 se inválido
    }

    const tileDiag = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const baseRadius = radiusStartFactor * tileDiag;
    const linearRadiusIncrement = radiusStepFactor * tileDiag;

    const baseCoords = [];
    const seenCoordsTuples = new Set();
    if (addCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }
    let currentRadius = baseRadius;
    for (let r = 0; r < numRings; r++) { // Itera sobre cada anel
        const numTilesInRing = tilesPerRing[r];
        const angleStep = (numTilesInRing > 0) ? (2 * Math.PI / numTilesInRing) : 0;
        for (let t = 0; t < numTilesInRing; t++) { // Itera sobre tiles no anel
            const angle = t * angleStep + angleOffsetRad;
            const xBase = currentRadius * Math.cos(angle);
            const yBase = currentRadius * Math.sin(angle);
            const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordTuple);
            }
        }
        currentRadius += linearRadiusIncrement; // Incrementa raio para próximo anel
    }

    const coordsToScale = addCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                         ? baseCoords.slice(1) : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = addCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                       ? [baseCoords[0], ...scaledPart] : scaledPart;

    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Anéis: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        let startIndex = 0;
        if (addCenterTile && scaledCoords.length > 0 && scaledCoords[0][0] === 0 && scaledCoords[0][1] === 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1;
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(xBase, yBase, randomOffsetStddevM, finalCoords, tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout Anéis: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [parseFloat(coord[0].toFixed(COORD_PRECISION)), parseFloat(coord[1].toFixed(COORD_PRECISION))]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    const totalTilesExpected = tilesPerRing.reduce((a, b) => a + b, 0) + (addCenterTile ? 1 : 0);
    console.log(`Layout Anéis (${numRings} anéis, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros (esperado ~${totalTilesExpected}).`);
    return centeredCoords;
}

/**
 * Cria um layout losangular (forma de diamante).
 * @param {number} numRowsHalf Número de "meias-linhas" (define o tamanho do losango).
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} sideLengthFactor Fator para o comprimento do lado da célula base do losango.
 * @param {number} hCompressFactor Fator de compressão horizontal.
 * @param {number} vCompressFactor Fator de compressão vertical.
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createRhombusLayout(
    numRowsHalf, tileWidthM, tileHeightM,
    sideLengthFactor = 0.65, hCompressFactor = 1.0, vCompressFactor = 1.0,
    centerExpScaleFactor = 1.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numRowsHalf <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    // O lado da célula hexagonal/triangular base que forma o losango.
    const sideLength = sideLengthFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);

    const baseCoords = [];
    const seenCoordsTuples = new Set();
    // Itera da linha central (i=0) para fora.
    for (let i = 0; i < numRowsHalf; i++) {
        const yBase = i * sideLength * Math.sqrt(3) / 2.0 * vCompressFactor; // Altura da linha
        const numTilesInRow = numRowsHalf - i; // Número de tiles na linha diminui
        const startXBase = -(numTilesInRow - 1) * sideLength * hCompressFactor / 2.0; // X inicial para centrar a linha

        for (let j = 0; j < numTilesInRow; j++) {
            const xBase = startXBase + j * sideLength * hCompressFactor;
            // Adiciona tile na parte superior (e central, se i=0)
            const coordUpperTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordUpperTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordUpperTuple);
            }
            // Adiciona tile espelhado na parte inferior (se não for a linha central)
            if (i !== 0) {
                const coordLowerTuple = `${xBase.toFixed(COORD_PRECISION)},${(-yBase).toFixed(COORD_PRECISION)}`;
                if (!seenCoordsTuples.has(coordLowerTuple)) {
                    baseCoords.push([xBase, -yBase]);
                    seenCoordsTuples.add(coordLowerTuple);
                }
            }
        }
    }

    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Losango: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(xBase, yBase, randomOffsetStddevM, finalCoords, tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout Losango: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [parseFloat(coord[0].toFixed(COORD_PRECISION)), parseFloat(coord[1].toFixed(COORD_PRECISION))]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Losangular (num_rows_half=${numRowsHalf}, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros.`);
    return centeredCoords;
}


/**
 * Cria um layout em grade hexagonal.
 * @param {number} numRingsHex Número de anéis hexagonais em torno do centro (0 para apenas centro).
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} spacingFactor Fator de espaçamento entre tiles (relativo à diagonal).
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {boolean} addCenterTile Se true, adiciona um tile na origem.
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createHexGridLayout(
    numRingsHex, tileWidthM, tileHeightM,
    spacingFactor = 1.5, centerExpScaleFactor = 1.0,
    addCenterTile = true, randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numRingsHex < 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    // Distância entre centros de tiles adjacentes na grade hexagonal.
    const baseSpacing = spacingFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);

    const baseCoords = [];
    const seenCoordsTuples = new Set(); // Usa axial coordinates (q,r) como string para `seen`
                                     // ou converte para string XY com precisão.
                                     // Aqui, optou-se por XY string.

    if (addCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }

    // Itera sobre cada anel hexagonal.
    for (let ring = 1; ring <= numRingsHex; ring++) {
        // Ponto inicial para cada anel (ex: no eixo x positivo).
        let xBase = ring * baseSpacing;
        let yBase = 0.0;
        let coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
        if (!seenCoordsTuples.has(coordTuple)) {
            baseCoords.push([xBase, yBase]);
            seenCoordsTuples.add(coordTuple);
        }

        // Percorre os 6 lados do hexágono.
        for (let side = 0; side < 6; side++) {
            const angle = Math.PI / 3.0; // 60 graus.
            // Em cada lado, há 'ring' número de tiles.
            for (let i = 0; i < ring; i++) {
                // Move para o próximo tile no lado atual.
                // O ângulo do deslocamento é (side + 2) * PI/3 para seguir a forma hexagonal.
                // side=0: move para noroeste. side=1: move para oeste. etc.
                const dx = baseSpacing * Math.cos((side + 2) * angle);
                const dy = baseSpacing * Math.sin((side + 2) * angle);
                xBase += dx;
                yBase += dy;
                coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
                if (!seenCoordsTuples.has(coordTuple)) {
                    baseCoords.push([xBase, yBase]);
                    seenCoordsTuples.add(coordTuple);
                }
            }
        }
    }

    const coordsToScale = addCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                         ? baseCoords.slice(1) : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = addCenterTile && baseCoords.length > 0 && baseCoords[0][0] === 0 && baseCoords[0][1] === 0
                       ? [baseCoords[0], ...scaledPart] : scaledPart;

    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout HexGrid: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        let startIndex = 0;
        if (addCenterTile && scaledCoords.length > 0 && scaledCoords[0][0] === 0 && scaledCoords[0][1] === 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1;
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(xBase, yBase, randomOffsetStddevM, finalCoords, tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout HexGrid: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [parseFloat(coord[0].toFixed(COORD_PRECISION)), parseFloat(coord[1].toFixed(COORD_PRECISION))]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    // Número esperado de tiles em uma grade hexagonal de `k` anéis é 1 + 6*1 + 6*2 + ... + 6*k = 1 + 3k(k+1)
    const expectedTiles = addCenterTile ?
        (1 + 3 * numRingsHex * (numRingsHex + 1)) :
        (numRingsHex > 0 ? (3 * numRingsHex * (numRingsHex + 1)) : 0);
    console.log(`Layout Grade Hexagonal (numRingsHex=${numRingsHex}, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros (esperado ${expectedTiles}).`);
    return centeredCoords;
}

/**
 * Cria um layout baseado no padrão Phyllotaxis (espiral de Fermat / girassol).
 * @param {number} numTiles Número total de tiles a serem posicionados.
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} scaleFactor Fator de escala para o raio (relativo à diagonal do tile).
 * @param {number} centerOffsetFactor Fator para um pequeno offset no cálculo do raio (evita ponto central exato).
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createPhyllotaxisLayout(
    numTiles, tileWidthM, tileHeightM,
    scaleFactor = 0.5, centerOffsetFactor = 0.1, centerExpScaleFactor = 1.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numTiles <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const baseScale = scaleFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);
    // O centerOffset ajuda a "abrir" o centro do padrão Phyllotaxis.
    const centerOffset = centerOffsetFactor; // Diretamente o fator, pois sqrt(i + offset)

    const baseCoords = [];
    for (let i = 0; i < numTiles; i++) {
        // Raio: r = c * sqrt(n + offset)
        const r = baseScale * Math.sqrt(i + centerOffset);
        // Ângulo: theta = n * golden_angle
        const theta = i * GOLDEN_ANGLE_RAD;
        const xBase = r * Math.cos(theta);
        const yBase = r * Math.sin(theta);
        baseCoords.push([xBase, yBase]);
    }

    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Phyllotaxis: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(xBase, yBase, randomOffsetStddevM, finalCoords, tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout Phyllotaxis: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [parseFloat(coord[0].toFixed(COORD_PRECISION)), parseFloat(coord[1].toFixed(COORD_PRECISION))]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Phyllotaxis (${numTiles} tiles, ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout pré-definido "Circular Manual" (específico do BINGO).
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} spacingXFactor Fator de espaçamento em X usado para escalar as coordenadas base.
 * @param {number} spacingYFactor Fator de espaçamento em Y usado para escalar as coordenadas base.
 * @param {number} centerExpScaleFactor Fator de escalonamento exponencial central.
 * @param {number} randomOffsetStddevM Desvio padrão do offset aleatório.
 * @param {number} minSeparationFactor Fator de separação mínima.
 * @param {number} maxPlacementAttempts Máximo de tentativas de posicionamento.
 * @param {boolean} centerLayout Se true, centraliza o layout.
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createManualCircularLayout(
    tileWidthM, tileHeightM,
    spacingXFactor = 1.0, spacingYFactor = 1.0, centerExpScaleFactor = 1.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (tileWidthM <= 0 || tileHeightM <= 0) return [];

    // As coordenadas base são multiplicadas pelos fatores de espaçamento X e Y.
    // Estes fatores atuam como um escalonamento global para este layout específico.
    const lenx = tileWidthM * spacingXFactor;
    const leny = tileHeightM * spacingYFactor;

    // Coordenadas pré-definidas do layout "Circular Manual".
    // Estas são as posições relativas, que serão escaladas por lenx/leny.
    const baseRelativeCoords = [
        [-5.5, 0], [-4.5, -0.5], [-4.5, 0.5],
        [-3.5, -1], [-3.5, 0], [-3.5, 1],
        [0.5, 0.5], [0.5, 1.5], [1.5, 0.5],
        [1.5, 1.5], [2.5, 0.5], [2.5, 1.5],
        [-0.5, 0.5], [-0.5, 1.5], [-1.5, 0.5],
        [-1.5, 1.5], [-2.5, 0.5], [-2.5, 1.5],
        [0.5, -0.5], [0.5, -1.5], [1.5, -0.5],
        [1.5, -1.5], [2.5, -0.5], [2.5, -1.5],
        [-0.5, -0.5], [-0.5, -1.5], [-1.5, -0.5],
        [-1.5, -1.5], [-2.5, -0.5], [-2.5, -1.5],
        [5.5, 0], [4.5, -0.5], [4.5, 0.5],
        [3.5, -1], [3.5, 0], [3.5, 1]
    ];

    // Escala as coordenadas relativas por lenx e leny.
    const baseCoords = baseRelativeCoords.map(coord => [coord[0] * lenx, coord[1] * leny]);

    // Aplica escalonamento exponencial central.
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    const finalCoords = [];
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout ManualCirc: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m)...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(xBase, yBase, randomOffsetStddevM, finalCoords, tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts);
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.warn(`Layout ManualCirc: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
    } else {
        finalCoords.push(...scaledCoords);
    }

    const roundedCoords = finalCoords.map(coord => [parseFloat(coord[0].toFixed(COORD_PRECISION)), parseFloat(coord[1].toFixed(COORD_PRECISION))]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Manual Circular (ExpFactor=${centerExpScaleFactor.toFixed(2)}): Gerou ${finalCoords.length} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout aleatório dentro de um raio máximo, com separação mínima retangular.
 * @param {number} numTiles Número de tiles a serem posicionados.
 * @param {number} maxRadiusM Raio máximo do círculo onde os tiles serão distribuídos.
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} minSeparationFactor Fator de separação mínima entre tiles.
 * @param {number} maxPlacementAttempts Máximo de tentativas por tile para encontrar uma posição.
 * @param {boolean} centerLayout Se true, centraliza o layout (geralmente já é centrado pela natureza aleatória).
 * @returns {Array<Array<number>>} Coordenadas dos centros dos tiles.
 */
function createRandomLayout(
    numTiles, maxRadiusM, tileWidthM, tileHeightM,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS * 10, // Aumenta tentativas para aleatório
    centerLayout = true
) {
    if (numTiles <= 0 || maxRadiusM <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    // Distâncias mínimas entre centros para evitar colisão retangular.
    const minRequiredDistX = tileWidthM * minSeparationFactor;
    const minRequiredDistY = tileHeightM * minSeparationFactor;

    const coords = [];
    let attemptsTotal = 0;
    let placedCount = 0;
    let skippedCount = 0;
    console.log(`Layout Aleatório: Tentando posicionar ${numTiles} tiles (Raio=${maxRadiusM.toFixed(2)}m) com checagem RETANGULAR...`);

    for (let i = 0; i < numTiles; i++) { // Tenta posicionar cada tile.
        let placed = false;
        for (let attempt = 0; attempt < maxPlacementAttempts; attempt++) {
            attemptsTotal++;
            // Gera coordenada polar aleatória (sqrt(random) para distribuição uniforme na área).
            const r = Math.sqrt(Math.random()) * maxRadiusM;
            const theta = Math.random() * 2 * Math.PI;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);

            let valid = true; // Assume que a posição é válida inicialmente.
            // Verifica colisão com todos os tiles já posicionados.
            for (const [existingX, existingY] of coords) {
                const deltaX = Math.abs(x - existingX);
                const deltaY = Math.abs(y - existingY);
                if (deltaX < minRequiredDistX && deltaY < minRequiredDistY) {
                    valid = false; // Colisão detectada.
                    break;
                }
            }
            if (valid) { // Nenhuma colisão, adiciona o tile.
                coords.push([
                    parseFloat(x.toFixed(COORD_PRECISION)),
                    parseFloat(y.toFixed(COORD_PRECISION))
                ]);
                placed = true;
                placedCount++;
                break; // Passa para o próximo tile.
            }
        }
        if (!placed) skippedCount++; // Não conseguiu posicionar este tile.
    }

    const finalCoords = centerLayout ? centerCoords(coords) : coords;
    console.log(`Layout Aleatório Puro (Raio=${maxRadiusM}m): Gerou ${placedCount} centros (${skippedCount} pulados). Tentativas totais: ${attemptsTotal}.`);
    return finalCoords;
}

// Exporta as funções para uso global no objeto window, se estiver em um ambiente de navegador.
if (typeof window !== 'undefined') {
    window.BingoLayouts = {
        createGridLayout,
        createSpiralLayout,
        createRingLayout,
        createRhombusLayout,
        createHexGridLayout,
        createPhyllotaxisLayout,
        createManualCircularLayout,
        createRandomLayout,
        centerCoords, // Exporta a função auxiliar também, pode ser útil.
        applyCenterExponentialScaling // Exporta função de scaling.
    };
} else {
    // Poderia exportar para `module.exports` se fosse para Node.js, por exemplo.
    console.log("BingoLayouts: Ambiente não-navegador detectado. Funções não foram anexadas a 'window'.");
}