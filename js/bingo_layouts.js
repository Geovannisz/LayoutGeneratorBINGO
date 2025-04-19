/**
 * Biblioteca JavaScript para gerar layouts de centros de tiles para estações BINGO.
 * Foco na geração das coordenadas relativas (X, Y) dos centros dos tiles.
 * A escolha entre espaçamento linear/exponencial foi removida; o fator
 * 'centerExpScaleFactor' controla isso (1.0 = linear).
 */

// Constantes Globais
const COORD_PRECISION = 6; // Número de casas decimais para as coordenadas
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5)); // Ângulo dourado em radianos para Phyllotaxis
const DEFAULT_MAX_PLACEMENT_ATTEMPTS = 10000; // Tentativas padrão para posicionamento com offset

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
 * Pontos mais distantes do centro são escalonados mais intensamente.
 * Um fator de 1.0 não aplica escalonamento.
 * @param {Array<Array<number>>} coords Coordenadas a serem escalonadas (já devem estar centradas se desejado).
 * @param {number} expScaleFactor Fator de escalonamento base. >1 expande, <1 contrai.
 * @returns {Array<Array<number>>} Coordenadas com escalonamento aplicado.
 */
function applyCenterExponentialScaling(coords, expScaleFactor) {
    if (!coords || coords.length === 0 || !(expScaleFactor > 0) || expScaleFactor === 1) {
        return coords; // Retorna original se não houver scaling a aplicar
    }
    const distances = coords.map(coord => Math.sqrt(coord[0]**2 + coord[1]**2));
    const nonZeroDistances = distances.filter(d => d > 1e-9);
    if (nonZeroDistances.length === 0) return coords;
    const refDistance = nonZeroDistances.reduce((a, b) => a + b, 0) / nonZeroDistances.length;
    if (refDistance < 1e-9) return coords;

    return coords.map((coord, i) => {
        const dist = distances[i];
        if (dist < 1e-9) return coord;
        const exponent = dist / refDistance;
        const scaleFactorPow = Math.pow(expScaleFactor, exponent);
        return [
            coord[0] * scaleFactorPow,
            coord[1] * scaleFactorPow
        ];
    });
}

/**
 * Tenta posicionar um tile com um offset aleatório, verificando colisões retangulares.
 * @param {number} baseX Coordenada X base.
 * @param {number} baseY Coordenada Y base.
 * @param {number} offsetStddevM Desvio padrão do offset aleatório.
 * @param {Array<Array<number>>} placedCoords Coordenadas dos tiles já posicionados.
 * @param {number} tileWidthM Largura do tile.
 * @param {number} tileHeightM Altura do tile.
 * @param {number} minSeparationFactor Fator de separação.
 * @param {number} maxAttempts Máximo de tentativas.
 * @returns {Array<number>|null} Coordenadas [x, y] válidas ou null.
 */
function placeWithRandomOffsetAndCollisionCheck(
    baseX, baseY, offsetStddevM, placedCoords,
    tileWidthM, tileHeightM, minSeparationFactor,
    maxAttempts
) {
    if (offsetStddevM <= 0) return [baseX, baseY];
    const minRequiredDistX = tileWidthM * minSeparationFactor;
    const minRequiredDistY = tileHeightM * minSeparationFactor;

    for (let i = 0; i < maxAttempts; i++) {
        let offsetX = 0, offsetY = 0;
        for (let j = 0; j < 6; j++) {
            offsetX += (Math.random() * 2 - 1);
            offsetY += (Math.random() * 2 - 1);
        }
        offsetX = (offsetX / 6) * offsetStddevM * 2.45;
        offsetY = (offsetY / 6) * offsetStddevM * 2.45;
        const candX = baseX + offsetX;
        const candY = baseY + offsetY;
        let collision = false;
        for (const placed of placedCoords) {
            const deltaX = Math.abs(candX - placed[0]);
            const deltaY = Math.abs(candY - placed[1]);
            if (deltaX < minRequiredDistX && deltaY < minRequiredDistY) {
                collision = true;
                break;
            }
        }
        if (!collision) {
            return [candX, candY];
        }
    }
    return null; // Falhou em encontrar posição
}


// === Funções Geradoras de Layout ===

/**
 * Cria um layout de grade retangular.
 * O espaçamento é definido por spacingXFactor/spacingYFactor e modificado por centerExpScaleFactor.
 */
function createGridLayout(
    numCols, numRows, tileWidthM, tileHeightM,
    // spacingMode removido
    spacingXFactor = 1.0, spacingYFactor = 1.0, centerExpScaleFactor = 1.0, // Padrão 1.0 para expFactor
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numCols <= 0 || numRows <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const spacingX = tileWidthM * spacingXFactor;
    const spacingY = tileHeightM * spacingYFactor;

    // Gera coordenadas base da grade
    const baseCoords = [];
    for (let i = 0; i < numCols; i++) {
        const xIndex = i - (numCols - 1) / 2.0;
        for (let j = 0; j < numRows; j++) {
            const yIndex = j - (numRows - 1) / 2.0;
            baseCoords.push([xIndex * spacingX, yIndex * spacingY]);
        }
    }

    // Aplica scaling exponencial INCONDICIONALMENTE
    // Se centerExpScaleFactor for 1.0, não haverá mudança (comportamento linear)
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Grid: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.log(`Layout Grid: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Grid (${numCols}x${numRows}, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout em espiral.
 * O espaçamento radial é definido por radiusStepFactor (interpretado linearmente) e modificado por centerExpScaleFactor.
 */
function createSpiralLayout(
    numArms, tilesPerArm, tileWidthM, tileHeightM,
    // armSpacingMode removido, centerScaleMode removido
    radiusStartFactor = 0.5, radiusStepFactor = 0.2, centerExpScaleFactor = 1.0, // Padrão 1.0
    angleStepRad = Math.PI / 6, armOffsetRad = 0.0, rotationPerArmRad = 0.0,
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true, includeCenterTile = false
) {
    if (numArms <= 0 || tilesPerArm <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const tileDiag = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const baseRadius = radiusStartFactor * tileDiag;
    // radiusStepFactor agora sempre representa o incremento linear antes do scaling exponencial
    const linearRadiusIncrement = radiusStepFactor * tileDiag;

    // Gera coordenadas base da espiral
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    if (includeCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }
    for (let p = 0; p < numArms; p++) {
        const currentArmAngle = p * (2 * Math.PI / numArms) + p * rotationPerArmRad + armOffsetRad;
        let currentRadius = baseRadius; // Raio começa do base para cada braço
        for (let i = 0; i < tilesPerArm; i++) {
            const currentAngle = currentArmAngle + i * angleStepRad;
            const xBase = currentRadius * Math.cos(currentAngle);
            const yBase = currentRadius * Math.sin(currentAngle);
            const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordTuple);
            }
            // Incrementa o raio linearmente para o próximo ponto
            currentRadius += linearRadiusIncrement;
        }
    }

    // Aplica scaling exponencial INCONDICIONALMENTE
    // Escala apenas os pontos que não são o centro (se incluído)
    const coordsToScale = includeCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = includeCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;


    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Espiral: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        let startIndex = 0;
        if (includeCenterTile && scaledCoords.length > 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(
                scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [],
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1;
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.log(`Layout Espiral: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Espiral (${numArms} braços, ${tilesPerArm} tiles/braço, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}


/**
 * Cria um layout em anéis concêntricos.
 * O espaçamento radial é definido por radiusStepFactor (interpretado linearmente) e modificado por centerExpScaleFactor.
 */
function createRingLayout(
    numRings, tilesPerRing, tileWidthM, tileHeightM,
    // ringSpacingMode removido, centerScaleMode removido
    radiusStartFactor = 0.5, radiusStepFactor = 0.5, centerExpScaleFactor = 1.0, // Padrão 1.0
    angleOffsetRad = 0.0, randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true, addCenterTile = true
) {
    if (numRings <= 0 || tileWidthM <= 0 || tileHeightM <= 0 || !Array.isArray(tilesPerRing)) return [];
    if (tilesPerRing.length !== numRings) {
        tilesPerRing = Array.from({ length: numRings }, (_, i) => Math.max(1, 8 * (i + 1)));
        console.log(`createRingLayout: Ajustando 'tilesPerRing' para ${numRings} anéis:`, tilesPerRing);
    } else {
         tilesPerRing = tilesPerRing.map(n => Math.max(1, parseInt(n) || 8));
    }

    const tileDiag = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const baseRadius = radiusStartFactor * tileDiag;
    // radiusStepFactor agora sempre representa o incremento linear antes do scaling exponencial
    const linearRadiusIncrement = radiusStepFactor * tileDiag;

    // Gera coordenadas base dos anéis
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    if (addCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }
    let currentRadius = baseRadius;
    for (let r = 0; r < numRings; r++) {
        const numTilesInRing = tilesPerRing[r];
        const angleStep = 2 * Math.PI / numTilesInRing;
        for (let t = 0; t < numTilesInRing; t++) {
            const angle = t * angleStep + angleOffsetRad;
            const xBase = currentRadius * Math.cos(angle);
            const yBase = currentRadius * Math.sin(angle);
            const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordTuple);
            }
        }
        // Incrementa o raio linearmente para o próximo anel
        currentRadius += linearRadiusIncrement;
    }

    // Aplica scaling exponencial INCONDICIONALMENTE
    const coordsToScale = addCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = addCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Anéis: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        let startIndex = 0;
        if (addCenterTile && scaledCoords.length > 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(
                scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [],
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1;
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
         if (skippedCount > 0) console.log(`Layout Anéis: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    const totalTilesExpected = tilesPerRing.reduce((a, b) => a + b, 0) + (addCenterTile ? 1 : 0);
    console.log(`Layout Anéis (${numRings} anéis, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros (esperado ${totalTilesExpected}).`);
    return centeredCoords;
}

/**
 * Cria um layout losangular (forma de diamante).
 * O espaçamento é definido pelos fatores de compressão/lado e modificado por centerExpScaleFactor.
 */
function createRhombusLayout(
    numRowsHalf, tileWidthM, tileHeightM,
    // spacingMode removido
    sideLengthFactor = 0.65, hCompressFactor = 1.0, vCompressFactor = 1.0,
    centerExpScaleFactor = 1.0, // Padrão 1.0
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numRowsHalf <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const sideLength = sideLengthFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);

    // Gera coordenadas base
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    for (let i = 0; i < numRowsHalf; i++) {
        const yBase = i * sideLength * Math.sqrt(3) / 2.0 * vCompressFactor;
        const numTilesInRow = numRowsHalf - i;
        const startXBase = -(numTilesInRow - 1) * sideLength * hCompressFactor / 2.0;
        for (let j = 0; j < numTilesInRow; j++) {
            const xBase = startXBase + j * sideLength * hCompressFactor;
            const coordUpperTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordUpperTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordUpperTuple);
            }
            if (i !== 0) {
                const coordLowerTuple = `${xBase.toFixed(COORD_PRECISION)},${(-yBase).toFixed(COORD_PRECISION)}`;
                if (!seenCoordsTuples.has(coordLowerTuple)) {
                    baseCoords.push([xBase, -yBase]);
                    seenCoordsTuples.add(coordLowerTuple);
                }
            }
        }
    }

    // Aplica scaling exponencial INCONDICIONALMENTE
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Losango: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
         if (skippedCount > 0) console.log(`Layout Losango: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Losangular (num_rows_half=${numRowsHalf}, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}


/**
 * Cria um layout em grade hexagonal.
 * O espaçamento é definido por spacingFactor e modificado por centerExpScaleFactor.
 */
function createHexGridLayout(
    numRingsHex, tileWidthM, tileHeightM,
    // spacingMode removido
    spacingFactor = 1.5, centerExpScaleFactor = 1.0, // Padrão 1.0
    addCenterTile = true, randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numRingsHex < 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const baseSpacing = spacingFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);

    // Gera coordenadas base
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    if (addCenterTile) {
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(`0.000000,0.000000`);
    }
    for (let ring = 1; ring <= numRingsHex; ring++) {
        let xBase = ring * baseSpacing;
        let yBase = 0.0;
        let coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
        if (!seenCoordsTuples.has(coordTuple)) {
            baseCoords.push([xBase, yBase]);
            seenCoordsTuples.add(coordTuple);
        }
        for (let side = 0; side < 6; side++) {
            const angle = Math.PI / 3.0;
            for (let i = 0; i < ring; i++) {
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

    // Aplica scaling exponencial INCONDICIONALMENTE
    const coordsToScale = addCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
    const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
    const scaledCoords = addCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout HexGrid: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        let startIndex = 0;
        if (addCenterTile && scaledCoords.length > 0) {
            const placedCenter = placeWithRandomOffsetAndCollisionCheck(
                scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [],
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCenter !== null) finalCoords.push(placedCenter); else skippedCount++;
            startIndex = 1;
        }
        for (let i = startIndex; i < scaledCoords.length; i++) {
            const [xBase, yBase] = scaledCoords[i];
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
         if (skippedCount > 0) console.log(`Layout HexGrid: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    const expectedTiles = addCenterTile ?
        (1 + Array.from({length: numRingsHex}, (_, i) => 6 * (i + 1)).reduce((a, b) => a + b, 0)) :
        Array.from({length: numRingsHex}, (_, i) => 6 * (i + 1)).reduce((a, b) => a + b, 0);
    console.log(`Layout Grade Hexagonal (numRingsHex=${numRingsHex}, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros (esperado ${expectedTiles}).`);
    return centeredCoords;
}

/**
 * Cria um layout baseado no padrão Phyllotaxis.
 * A escala é definida por scaleFactor e modificada por centerExpScaleFactor.
 */
function createPhyllotaxisLayout(
    numTiles, tileWidthM, tileHeightM,
    // spacingMode removido
    scaleFactor = 0.5, centerOffsetFactor = 0.1, centerExpScaleFactor = 1.0, // Padrão 1.0
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (numTiles <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const baseScale = scaleFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const centerOffset = centerOffsetFactor * Math.sqrt(tileWidthM**2 + tileHeightM**2);

    // Gera coordenadas base
    const baseCoords = [];
    for (let i = 0; i < numTiles; i++) {
        const r = baseScale * Math.sqrt(i + centerOffset);
        const theta = i * GOLDEN_ANGLE_RAD;
        const xBase = r * Math.cos(theta);
        const yBase = r * Math.sin(theta);
        baseCoords.push([xBase, yBase]);
    }

    // Aplica scaling exponencial INCONDICIONALMENTE
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout Phyllotaxis: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.log(`Layout Phyllotaxis: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Phyllotaxis (${numTiles} tiles, FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout pré-definido "Circular Manual".
 * O espaçamento é definido por spacingX/YFactor e modificado por centerExpScaleFactor.
 */
function createManualCircularLayout(
    tileWidthM, tileHeightM,
    // spacingMode removido
    spacingXFactor = 1.0, spacingYFactor = 1.0, centerExpScaleFactor = 1.0, // Padrão 1.0
    randomOffsetStddevM = 0.0, minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS, centerLayout = true
) {
    if (tileWidthM <= 0 || tileHeightM <= 0) return [];

    // Define as coordenadas base USANDO os fatores X/Y
    const lenx = tileWidthM * spacingXFactor;
    const leny = tileHeightM * spacingYFactor;
    const baseCoords = [
        [-5.5*lenx, 0], [-4.5*lenx, -0.5*leny], [-4.5*lenx, 0.5*leny],
        [-3.5*lenx, -1*leny], [-3.5*lenx, 0], [-3.5*lenx, 1*leny],
        [0.5*lenx, 0.5*leny], [0.5*lenx, 1.5*leny], [1.5*lenx, 0.5*leny],
        [1.5*lenx, 1.5*leny], [2.5*lenx, 0.5*leny], [2.5*lenx, 1.5*leny],
        [-0.5*lenx, 0.5*leny], [-0.5*lenx, 1.5*leny], [-1.5*lenx, 0.5*leny],
        [-1.5*lenx, 1.5*leny], [-2.5*lenx, 0.5*leny], [-2.5*lenx, 1.5*leny],
        [0.5*lenx, -0.5*leny], [0.5*lenx, -1.5*leny], [1.5*lenx, -0.5*leny],
        [1.5*lenx, -1.5*leny], [2.5*lenx, -0.5*leny], [2.5*lenx, -1.5*leny],
        [-0.5*lenx, -0.5*leny], [-0.5*lenx, -1.5*leny], [-1.5*lenx, -0.5*leny],
        [-1.5*lenx, -1.5*leny], [-2.5*lenx, -0.5*leny], [-2.5*lenx, -1.5*leny],
        [5.5*lenx, 0], [4.5*lenx, -0.5*leny], [4.5*lenx, 0.5*leny],
        [3.5*lenx, -1*leny], [3.5*lenx, 0], [3.5*lenx, 1*leny]
    ];

    // Aplica scaling exponencial INCONDICIONALMENTE às coordenadas base já espaçadas
    const scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);

    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    if (randomOffsetStddevM > 0) {
        console.log(`Layout ManualCirc: Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem RETANGULAR...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords,
                tileWidthM, tileHeightM, minSeparationFactor, maxPlacementAttempts
            );
            if (placedCoord !== null) finalCoords.push(placedCoord); else skippedCount++;
        }
        if (skippedCount > 0) console.log(`Layout ManualCirc: ${skippedCount}/${scaledCoords.length} tiles pulados.`);
        placedCount = finalCoords.length;
    } else {
        finalCoords.push(...scaledCoords);
        placedCount = finalCoords.length;
    }

    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    console.log(`Layout Manual Circular (FatorExp=${centerExpScaleFactor.toFixed(2)}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

/**
 * Cria um layout aleatório dentro de um raio máximo, com separação mínima retangular.
 */
function createRandomLayout(
    numTiles, maxRadiusM, tileWidthM, tileHeightM,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS * 10,
    centerLayout = true
) {
    if (numTiles <= 0 || maxRadiusM <= 0 || tileWidthM <= 0 || tileHeightM <= 0) return [];

    const minRequiredDistX = tileWidthM * minSeparationFactor;
    const minRequiredDistY = tileHeightM * minSeparationFactor;
    const coords = [];
    let attemptsTotal = 0;
    let placedCount = 0;
    let skippedCount = 0;
    console.log(`Layout Aleatório: Tentando posicionar ${numTiles} tiles (R=${maxRadiusM.toFixed(2)}m) com checagem RETANGULAR...`);

    for (let i = 0; i < numTiles; i++) {
        let placed = false;
        for (let attempt = 0; attempt < maxPlacementAttempts; attempt++) {
            attemptsTotal++;
            const r = Math.sqrt(Math.random()) * maxRadiusM;
            const theta = Math.random() * 2 * Math.PI;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            let valid = true;
            for (const [existingX, existingY] of coords) {
                const deltaX = Math.abs(x - existingX);
                const deltaY = Math.abs(y - existingY);
                if (deltaX < minRequiredDistX && deltaY < minRequiredDistY) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                coords.push([
                    parseFloat(x.toFixed(COORD_PRECISION)),
                    parseFloat(y.toFixed(COORD_PRECISION))
                ]);
                placed = true;
                placedCount++;
                break;
            }
        }
        if (!placed) skippedCount++;
    }

    const finalCoords = centerLayout ? centerCoords(coords) : coords;
    console.log(`Layout Aleatório Puro (R=${maxRadiusM}m): Gerou ${placedCount} centros (${skippedCount} pulados). Tentativas: ${attemptsTotal}.`);
    return finalCoords;
}

// Exporta as funções para uso global
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
        centerCoords,
        applyCenterExponentialScaling
    };
} else {
    console.log("BingoLayouts: Ambiente não-navegador detectado.");
}