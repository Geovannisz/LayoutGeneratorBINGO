/**
 * Biblioteca JavaScript para gerar layouts de centros de tiles para estações BINGO.
 * Adaptada da versão Python (bingo_layouts.py)
 */

// Constantes
const COORD_PRECISION = 6;
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));
const DEFAULT_MAX_PLACEMENT_ATTEMPTS = 10000;

// Funções auxiliares
function centerCoords(coords) {
    if (!coords || coords.length === 0) return [];
    
    // Calcula o centro
    let sumX = 0, sumY = 0;
    for (const coord of coords) {
        sumX += coord[0];
        sumY += coord[1];
    }
    
    const centerX = sumX / coords.length;
    const centerY = sumY / coords.length;
    
    // Centraliza as coordenadas
    return coords.map(coord => [
        parseFloat((coord[0] - centerX).toFixed(COORD_PRECISION)),
        parseFloat((coord[1] - centerY).toFixed(COORD_PRECISION))
    ]);
}

function applyCenterExponentialScaling(coords, expScaleFactor) {
    if (!coords || coords.length === 0 || !(expScaleFactor > 0) || expScaleFactor === 1) {
        return coords;
    }
    
    // Calcula distâncias da origem (0,0) para cada ponto
    const distances = coords.map(coord => Math.sqrt(coord[0]**2 + coord[1]**2));
    
    // Ignora ponto(s) na origem para calcular distância de referência
    const nonZeroDistances = distances.filter(d => d > 1e-9);
    if (nonZeroDistances.length === 0) return coords; // Todos os pontos na origem
    
    // Usa a distância média não nula como referência para normalizar o expoente
    const refDistance = nonZeroDistances.reduce((a, b) => a + b, 0) / nonZeroDistances.length;
    if (refDistance < 1e-9) return coords; // Caso raro
    
    // Aplica scaling exponencial
    return coords.map((coord, i) => {
        const dist = distances[i];
        if (dist < 1e-9) return coord; // Não escala o ponto central
        
        // Expoente é proporcional à distância relativa à referência
        const exponent = dist / refDistance;
        const scaleFactorPow = Math.pow(expScaleFactor, exponent);
        
        return [
            coord[0] * scaleFactorPow,
            coord[1] * scaleFactorPow
        ];
    });
}

function placeWithRandomOffsetAndCollisionCheck(baseX, baseY, offsetStddevM, placedCoords, minDistSq, maxAttempts) {
    if (offsetStddevM <= 0) return [baseX, baseY];
    
    for (let i = 0; i < maxAttempts; i++) {
        // Gera offset aleatório com distribuição normal (aproximação)
        let offsetX = 0, offsetY = 0;
        for (let j = 0; j < 6; j++) { // Aproximação da distribuição normal
            offsetX += (Math.random() * 2 - 1);
            offsetY += (Math.random() * 2 - 1);
        }
        offsetX = (offsetX / 6) * offsetStddevM;
        offsetY = (offsetY / 6) * offsetStddevM;
        
        const candX = baseX + offsetX;
        const candY = baseY + offsetY;
        
        // Verifica colisão com todos os pontos já colocados
        let collision = false;
        for (const placed of placedCoords) {
            const distSq = (candX - placed[0])**2 + (candY - placed[1])**2;
            if (distSq < minDistSq) {
                collision = true;
                break;
            }
        }
        
        if (!collision) {
            return [candX, candY];
        }
    }
    
    // Falhou em encontrar posição válida
    return null;
}

// Funções geradoras de layout
function createGridLayout(
    numCols, 
    numRows, 
    tileWidthM, 
    tileHeightM, 
    spacingMode = 'linear',
    spacingXFactor = 1.0,
    spacingYFactor = 1.0,
    centerExpScaleFactor = 1.1,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true
) {
    if (numCols <= 0 || numRows <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createGridLayout): Dimensões e tamanhos devem ser positivos.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    
    const spacingX = tileWidthM * spacingXFactor;
    const spacingY = tileHeightM * spacingYFactor;
    
    // Gera coordenadas base
    const baseCoords = [];
    for (let i = 0; i < numCols; i++) {
        const xIndex = i - (numCols - 1) / 2.0;
        for (let j = 0; j < numRows; j++) {
            const yIndex = j - (numRows - 1) / 2.0;
            baseCoords.push([xIndex * spacingX, yIndex * spacingY]);
        }
    }
    
    // Aplica scaling exponencial
    let scaledCoords = baseCoords;
    if (spacingMode === 'center_exponential') {
        scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Não foi possível posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${scaledCoords.length} tiles foram pulados devido a colisões persistentes.`);
        }
    } else {
        // Sem offset, usa as coordenadas escaladas/base
        for (const coord of scaledCoords) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda antes de centralizar
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    // Centraliza o resultado final
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Grid (${numCols}x${numRows}, modo=${spacingMode}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

function createSpiralLayout(
    numArms,
    tilesPerArm,
    tileWidthM,
    tileHeightM,
    armSpacingMode = 'linear',
    centerScaleMode = 'none',
    radiusStartFactor = 0.5,
    radiusStepFactor = 0.2,
    centerExpScaleFactor = 1.1,
    angleStepRad = Math.PI / 6,
    armOffsetRad = 0.0,
    rotationPerArmRad = 0.0,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true,
    includeCenterTile = false
) {
    if (numArms <= 0 || tilesPerArm <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createSpiralLayout): Dimensões e contagens devem ser positivas.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    const baseRadius = radiusStartFactor * tileDiagonalM;
    const linearRadiusIncrement = (armSpacingMode === 'linear') ? radiusStepFactor * tileDiagonalM : 0;
    
    // Gera coordenadas base da espiral
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    
    if (includeCenterTile) {
        const centerCoordTuple = `${(0.0).toFixed(COORD_PRECISION)},${(0.0).toFixed(COORD_PRECISION)}`;
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(centerCoordTuple);
    }
    
    for (let p = 0; p < numArms; p++) {
        const currentArmAngle = p * (2 * Math.PI / numArms) + p * rotationPerArmRad + armOffsetRad;
        let currentRadius = baseRadius;
        
        for (let i = 0; i < tilesPerArm; i++) {
            const currentAngle = currentArmAngle + i * angleStepRad;
            const xBase = currentRadius * Math.cos(currentAngle);
            const yBase = currentRadius * Math.sin(currentAngle);
            
            const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordTuple);
            }
            
            if (armSpacingMode === 'linear') {
                currentRadius += linearRadiusIncrement;
            } else if (armSpacingMode === 'exponential') {
                currentRadius *= radiusStepFactor;
            }
        }
    }
    
    // Aplica scaling exponencial central (opcional)
    let scaledCoords = baseCoords;
    if (centerScaleMode === 'center_exponential') {
        const coordsToScale = includeCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
        const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
        scaledCoords = includeCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    // Adiciona o ponto central primeiro se existir
    if (includeCenterTile && scaledCoords.length > 0 && randomOffsetStddevM > 0) {
        const placedCenter = placeWithRandomOffsetAndCollisionCheck(
            scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], minDistSq, maxPlacementAttempts
        );
        
        if (placedCenter !== null) {
            finalCoords.push(placedCenter);
        } else {
            finalCoords.push(scaledCoords[0]);
            console.warn("Aviso: Offset aleatório falhou para tile central.");
        }
        
        placedCount = finalCoords.length;
    } else if (includeCenterTile && scaledCoords.length > 0) {
        finalCoords.push(scaledCoords[0]);
        placedCount = 1;
    }
    
    const coordsToProcess = includeCenterTile && scaledCoords.length > 0 ? scaledCoords.slice(1) : scaledCoords;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of coordsToProcess) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${coordsToProcess.length} tiles pulados.`);
        }
    } else {
        for (const coord of coordsToProcess) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Espiral (${numArms} braços, ${tilesPerArm} tiles/braço): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

function createRingLayout(
    numRings,
    tilesPerRing,
    tileWidthM,
    tileHeightM,
    ringSpacingMode = 'linear',
    centerScaleMode = 'none',
    radiusStartFactor = 0.5,
    radiusStepFactor = 0.5,
    centerExpScaleFactor = 1.1,
    angleOffsetRad = 0.0,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true,
    addCenterTile = true
) {
    if (numRings <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createRingLayout): Dimensões e contagens devem ser positivas.");
        return [];
    }
    
    if (tilesPerRing.length !== numRings) {
        console.warn(`Aviso (createRingLayout): tilesPerRing deve ter ${numRings} elementos.`);
        // Ajusta para um valor padrão se não for fornecido corretamente
        tilesPerRing = Array(numRings).fill(8);
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    const baseRadius = radiusStartFactor * tileDiagonalM;
    const linearRadiusIncrement = (ringSpacingMode === 'linear') ? radiusStepFactor * tileDiagonalM : 0;
    
    // Gera coordenadas base dos anéis
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    
    if (addCenterTile) {
        const centerCoordTuple = `${(0.0).toFixed(COORD_PRECISION)},${(0.0).toFixed(COORD_PRECISION)}`;
        baseCoords.push([0.0, 0.0]);
        seenCoordsTuples.add(centerCoordTuple);
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
        
        if (ringSpacingMode === 'linear') {
            currentRadius += linearRadiusIncrement;
        } else if (ringSpacingMode === 'exponential') {
            currentRadius *= radiusStepFactor;
        }
    }
    
    // Aplica scaling exponencial central (opcional)
    let scaledCoords = baseCoords;
    if (centerScaleMode === 'center_exponential') {
        const coordsToScale = addCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
        const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
        scaledCoords = addCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    // Adiciona o ponto central primeiro se existir
    if (addCenterTile && scaledCoords.length > 0 && randomOffsetStddevM > 0) {
        const placedCenter = placeWithRandomOffsetAndCollisionCheck(
            scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], minDistSq, maxPlacementAttempts
        );
        
        if (placedCenter !== null) {
            finalCoords.push(placedCenter);
        } else {
            finalCoords.push(scaledCoords[0]);
            console.warn("Aviso: Offset aleatório falhou para tile central.");
        }
        
        placedCount = finalCoords.length;
    } else if (addCenterTile && scaledCoords.length > 0) {
        finalCoords.push(scaledCoords[0]);
        placedCount = 1;
    }
    
    const coordsToProcess = addCenterTile && scaledCoords.length > 0 ? scaledCoords.slice(1) : scaledCoords;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of coordsToProcess) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${coordsToProcess.length} tiles pulados.`);
        }
    } else {
        for (const coord of coordsToProcess) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    const totalTilesExpected = tilesPerRing.reduce((a, b) => a + b, 0) + (addCenterTile ? 1 : 0);
    console.log(`Layout Anéis (${numRings} anéis): Gerou ${placedCount} centros (esperado ${totalTilesExpected}).`);
    return centeredCoords;
}

function createRhombusLayout(
    numRowsHalf,
    tileWidthM,
    tileHeightM,
    spacingMode = 'linear',
    sideLengthFactor = 0.65,
    hCompressFactor = 1.0,
    vCompressFactor = 1.0,
    centerExpScaleFactor = 1.1,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true
) {
    if (numRowsHalf <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createRhombusLayout): Dimensões e contagens devem ser positivas.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    const sideLength = sideLengthFactor * tileDiagonalM;
    
    // Gera coordenadas base
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    
    for (let i = 0; i < numRowsHalf; i++) {
        const yBase = i * sideLength * Math.sqrt(3) / 2.0 * vCompressFactor;
        const numTilesInRow = numRowsHalf - i;
        const startXBase = -(numTilesInRow - 1) * sideLength * hCompressFactor / 2.0;
        
        for (let j = 0; j < numTilesInRow; j++) {
            const xBase = startXBase + j * sideLength * hCompressFactor;
            
            // Parte superior
            const coordUpperTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
            if (!seenCoordsTuples.has(coordUpperTuple)) {
                baseCoords.push([xBase, yBase]);
                seenCoordsTuples.add(coordUpperTuple);
            }
            
            // Parte inferior (exceto linha central)
            if (i !== 0) {
                const coordLowerTuple = `${xBase.toFixed(COORD_PRECISION)},${(-yBase).toFixed(COORD_PRECISION)}`;
                if (!seenCoordsTuples.has(coordLowerTuple)) {
                    baseCoords.push([xBase, -yBase]);
                    seenCoordsTuples.add(coordLowerTuple);
                }
            }
        }
    }
    
    // Aplica scaling exponencial
    let scaledCoords = baseCoords;
    if (spacingMode === 'center_exponential') {
        scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${scaledCoords.length} tiles pulados.`);
        }
    } else {
        for (const coord of scaledCoords) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Losangular (num_rows_half=${numRowsHalf}, modo=${spacingMode}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

function createHexGridLayout(
    numRingsHex,
    tileWidthM,
    tileHeightM,
    spacingMode = 'linear',
    spacingFactor = 1.5,
    centerExpScaleFactor = 1.1,
    addCenterTile = true,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true
) {
    if (numRingsHex < 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createHexGridLayout): numRingsHex >= 0 e dimensões > 0.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    const baseSpacing = spacingFactor * tileDiagonalM;
    
    // Gera coordenadas base
    const baseCoords = [];
    const seenCoordsTuples = new Set();
    
    if (addCenterTile) {
        const centerCoord = [0.0, 0.0];
        baseCoords.push(centerCoord);
        seenCoordsTuples.add(`0,0`);
    }
    
    for (let ring = 1; ring <= numRingsHex; ring++) {
        let xBase = ring * baseSpacing;
        let yBase = 0.0;
        
        const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
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
                
                const coordTuple = `${xBase.toFixed(COORD_PRECISION)},${yBase.toFixed(COORD_PRECISION)}`;
                if (!seenCoordsTuples.has(coordTuple)) {
                    baseCoords.push([xBase, yBase]);
                    seenCoordsTuples.add(coordTuple);
                }
            }
        }
    }
    
    // Aplica scaling exponencial
    let scaledCoords = baseCoords;
    if (spacingMode === 'center_exponential') {
        const coordsToScale = addCenterTile && baseCoords.length > 0 ? baseCoords.slice(1) : baseCoords;
        const scaledPart = applyCenterExponentialScaling(coordsToScale, centerExpScaleFactor);
        scaledCoords = addCenterTile && baseCoords.length > 0 ? [baseCoords[0], ...scaledPart] : scaledPart;
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    // Adiciona o ponto central primeiro se existir
    if (addCenterTile && scaledCoords.length > 0 && randomOffsetStddevM > 0) {
        const placedCenter = placeWithRandomOffsetAndCollisionCheck(
            scaledCoords[0][0], scaledCoords[0][1], randomOffsetStddevM, [], minDistSq, maxPlacementAttempts
        );
        
        if (placedCenter !== null) {
            finalCoords.push(placedCenter);
        } else {
            finalCoords.push(scaledCoords[0]);
            console.warn("Aviso: Offset aleatório falhou para tile central.");
        }
        
        placedCount = finalCoords.length;
    } else if (addCenterTile && scaledCoords.length > 0) {
        finalCoords.push(scaledCoords[0]);
        placedCount = 1;
    }
    
    const coordsToProcess = addCenterTile && scaledCoords.length > 0 ? scaledCoords.slice(1) : scaledCoords;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of coordsToProcess) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${coordsToProcess.length} tiles pulados.`);
        }
    } else {
        for (const coord of coordsToProcess) {
            finalCoords.push(coord);
        }
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
    
    console.log(`Layout Grade Hexagonal (numRingsHex=${numRingsHex}, modo=${spacingMode}): Gerou ${placedCount} centros (esperado ~${expectedTiles}).`);
    return centeredCoords;
}

function createPhyllotaxisLayout(
    numTiles,
    tileWidthM,
    tileHeightM,
    spacingMode = 'linear',
    scaleFactor = 0.5,
    centerOffsetFactor = 0.1,
    centerExpScaleFactor = 1.1,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true
) {
    if (numTiles <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createPhyllotaxisLayout): Contagem e dimensões devem ser positivas.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    const scale = scaleFactor * tileDiagonalM;
    const centerOffset = centerOffsetFactor * tileDiagonalM;
    
    // Gera coordenadas base
    const baseCoords = [];
    for (let i = 0; i < numTiles; i++) {
        const r = scale * Math.sqrt(i + centerOffset);
        const theta = i * GOLDEN_ANGLE_RAD;
        const xBase = r * Math.cos(theta);
        const yBase = r * Math.sin(theta);
        baseCoords.push([xBase, yBase]);
    }
    
    // Aplica scaling exponencial
    let scaledCoords = baseCoords;
    if (spacingMode === 'center_exponential') {
        scaledCoords = applyCenterExponentialScaling(baseCoords, centerExpScaleFactor);
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${scaledCoords.length} tiles pulados.`);
        }
    } else {
        for (const coord of scaledCoords) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Phyllotaxis (${numTiles} tiles): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

function createManualCircularLayout(
    tileWidthM,
    tileHeightM,
    spacingMode = 'linear',
    spacingXFactor = 1.0,
    spacingYFactor = 1.0,
    centerExpScaleFactor = 1.1,
    randomOffsetStddevM = 0.0,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS,
    centerLayout = true
) {
    if (tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createManualCircularLayout): Dimensões devem ser positivas.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (randomOffsetStddevM > 0) ? (minSeparationFactor * tileDiagonalM)**2 : 0;
    
    // Gera coordenadas base usando fatores X/Y
    const lenx = tileWidthM * spacingXFactor;
    const leny = tileHeightM * spacingYFactor;
    
    // Coordenadas pré-definidas para o layout circular manual
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
    
    // Aplica scaling exponencial
    let scaledCoords = baseCoords;
    if (spacingMode === 'center_exponential') {
        // No modo exponencial, ignora fatores x/y e escala a versão base (fator=1)
        const lenxBase = tileWidthM * 1.0;
        const lenyBase = tileHeightM * 1.0;
        
        // Recalcula coords com fator 1 para scaling exponencial
        const expBaseCoords = [
            [-5.5*lenxBase, 0], [-4.5*lenxBase, -0.5*lenyBase], [-4.5*lenxBase, 0.5*lenyBase], 
            [-3.5*lenxBase, -1*lenyBase], [-3.5*lenxBase, 0], [-3.5*lenxBase, 1*lenyBase],
            
            [0.5*lenxBase, 0.5*lenyBase], [0.5*lenxBase, 1.5*lenyBase], [1.5*lenxBase, 0.5*lenyBase], 
            [1.5*lenxBase, 1.5*lenyBase], [2.5*lenxBase, 0.5*lenyBase], [2.5*lenxBase, 1.5*lenyBase],
            
            [-0.5*lenxBase, 0.5*lenyBase], [-0.5*lenxBase, 1.5*lenyBase], [-1.5*lenxBase, 0.5*lenyBase], 
            [-1.5*lenxBase, 1.5*lenyBase], [-2.5*lenxBase, 0.5*lenyBase], [-2.5*lenxBase, 1.5*lenyBase],
            
            [0.5*lenxBase, -0.5*lenyBase], [0.5*lenxBase, -1.5*lenyBase], [1.5*lenxBase, -0.5*lenyBase], 
            [1.5*lenxBase, -1.5*lenyBase], [2.5*lenxBase, -0.5*lenyBase], [2.5*lenxBase, -1.5*lenyBase],
            
            [-0.5*lenxBase, -0.5*lenyBase], [-0.5*lenxBase, -1.5*lenyBase], [-1.5*lenxBase, -0.5*lenyBase], 
            [-1.5*lenxBase, -1.5*lenyBase], [-2.5*lenxBase, -0.5*lenyBase], [-2.5*lenxBase, -1.5*lenyBase],
            
            [5.5*lenxBase, 0], [4.5*lenxBase, -0.5*lenyBase], [4.5*lenxBase, 0.5*lenyBase], 
            [3.5*lenxBase, -1*lenyBase], [3.5*lenxBase, 0], [3.5*lenxBase, 1*lenyBase]
        ];
        
        scaledCoords = applyCenterExponentialScaling(expBaseCoords, centerExpScaleFactor);
    }
    
    // Posiciona com offset e checagem de colisão
    const finalCoords = [];
    let placedCount = 0;
    let skippedCount = 0;
    
    if (randomOffsetStddevM > 0) {
        console.log(`Aplicando offset aleatório (stddev=${randomOffsetStddevM.toFixed(3)}m) com checagem de colisão...`);
        
        for (const [xBase, yBase] of scaledCoords) {
            const placedCoord = placeWithRandomOffsetAndCollisionCheck(
                xBase, yBase, randomOffsetStddevM, finalCoords, minDistSq, maxPlacementAttempts
            );
            
            if (placedCoord !== null) {
                finalCoords.push(placedCoord);
                placedCount++;
            } else {
                console.warn(`Aviso: Falha ao posicionar tile perto de (${xBase.toFixed(2)}, ${yBase.toFixed(2)}) após ${maxPlacementAttempts} tentativas.`);
                skippedCount++;
            }
        }
        
        if (skippedCount > 0) {
            console.log(`${skippedCount}/${scaledCoords.length} tiles pulados.`);
        }
    } else {
        for (const coord of scaledCoords) {
            finalCoords.push(coord);
        }
        placedCount = finalCoords.length;
    }
    
    // Arredonda e centraliza
    const roundedCoords = finalCoords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Manual Circular (modo=${spacingMode}): Gerou ${placedCount} centros.`);
    return centeredCoords;
}

function createRandomLayout(
    numTiles,
    maxRadiusM,
    tileWidthM,
    tileHeightM,
    minSeparationFactor = 1.05,
    maxPlacementAttempts = DEFAULT_MAX_PLACEMENT_ATTEMPTS * 10,
    centerLayout = true
) {
    if (numTiles <= 0) return [];
    if (maxRadiusM <= 0 || tileWidthM <= 0 || tileHeightM <= 0) {
        console.warn("Aviso (createRandomLayout): Raio e dimensões devem ser positivos.");
        return [];
    }
    
    const tileDiagonalM = Math.sqrt(tileWidthM**2 + tileHeightM**2);
    const minDistSq = (minSeparationFactor * tileDiagonalM)**2;
    
    const coords = [];
    let attemptsTotal = 0;
    let placedCount = 0;
    let skippedCount = 0;
    
    console.log(`Tentando posicionar ${numTiles} tiles aleatoriamente (max_radius=${maxRadiusM.toFixed(2)}m)...`);
    
    for (let i = 0; i < numTiles; i++) {
        let placed = false;
        
        for (let attempt = 0; attempt < maxPlacementAttempts; attempt++) {
            attemptsTotal++;
            
            // Gera ponto aleatório dentro do círculo
            const r = Math.random() * maxRadiusM; // Distribuição uniforme de raio
            const theta = Math.random() * 2 * Math.PI;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            
            // Verifica colisão com pontos já colocados
            let valid = true;
            for (const [existingX, existingY] of coords) {
                const distSq = (x - existingX)**2 + (y - existingY)**2;
                if (distSq < minDistSq) {
                    valid = false;
                    break;
                }
            }
            
            if (valid) {
                coords.push([x, y]);
                placed = true;
                placedCount++;
                break;
            }
        }
        
        if (!placed) {
            console.warn(`Aviso: Não foi possível posicionar o tile ${coords.length+1} após ${maxPlacementAttempts} tentativas.`);
            skippedCount++;
        }
    }
    
    // Arredonda e centraliza
    const roundedCoords = coords.map(coord => [
        parseFloat(coord[0].toFixed(COORD_PRECISION)),
        parseFloat(coord[1].toFixed(COORD_PRECISION))
    ]);
    
    const centeredCoords = centerLayout ? centerCoords(roundedCoords) : roundedCoords;
    
    console.log(`Layout Aleatório Puro (R=${maxRadiusM}m): Gerou ${placedCount} centros (${skippedCount} pulados). Tentativas: ${attemptsTotal}.`);
    return centeredCoords;
}

// Exporta as funções para uso global
window.BingoLayouts = {
    createGridLayout,
    createSpiralLayout,
    createRingLayout,
    createRhombusLayout,
    createHexGridLayout,
    createPhyllotaxisLayout,
    createManualCircularLayout,
    createRandomLayout,
    // Funções auxiliares que podem ser úteis
    centerCoords,
    applyCenterExponentialScaling
};
