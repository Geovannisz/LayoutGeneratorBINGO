/**
 * constants.js
 *
 * Shared constants and configuration values used across multiple modules.
 * Centralizes physical parameters, tile dimensions, and other configuration
 * to ensure consistency and facilitate maintenance.
 *
 * @fileoverview Centralized constants for the BINGO Layout Generator application.
 * @author Geovanni Fernandes Garcia
 * @version 1.0.2
 */

'use strict';

/**
 * @namespace BingoConstants
 * @description Global namespace for BINGO Layout Generator constants
 */
const BingoConstants = (function() {

    // ===================
    // Physical Constants
    // ===================

    /**
     * Operating frequency in Hz
     * @constant {number}
     */
    const FREQUENCY_HZ = 1e9;

    /**
     * Speed of light in m/s
     * @constant {number}
     */
    const SPEED_OF_LIGHT = 299792458;

    /**
     * Wavelength in meters (lambda = c/f)
     * @constant {number}
     */
    const WAVELENGTH = SPEED_OF_LIGHT / FREQUENCY_HZ;

    /**
     * Wave number k = 2π/λ
     * @constant {number}
     */
    const WAVE_NUMBER_K = (2 * Math.PI) / WAVELENGTH;

    // ===================
    // Tile Dimensions
    // ===================

    /**
     * Tile width in meters
     * @constant {number}
     */
    const TILE_WIDTH_M = 0.35;

    /**
     * Tile height in meters
     * @constant {number}
     */
    const TILE_HEIGHT_M = 1.34;

    /**
     * Number of antennas per tile
     * @constant {number}
     */
    const ANTENNAS_PER_TILE = 64;

    // ===================
    // Antenna Sub-group Configuration
    // ===================

    /**
     * Number of columns in antenna sub-group
     * @constant {number}
     */
    const SUBGROUP_COLUMNS = 2;

    /**
     * Number of rows in antenna sub-group
     * @constant {number}
     */
    const SUBGROUP_ROWS = 8;

    /**
     * Horizontal spacing in sub-group (meters)
     * @constant {number}
     */
    const SUBGROUP_DX = 0.1760695885;

    /**
     * Vertical spacing in sub-group (meters)
     * @constant {number}
     */
    const SUBGROUP_DY = 0.1675843071;

    /**
     * Diamond pattern offset (meters)
     * @constant {number}
     */
    const DIAMOND_OFFSET = 0.05;

    // ===================
    // BINGO Central Location (WGS84)
    // ===================

    /**
     * BINGO Central latitude in degrees
     * @constant {number}
     */
    const BINGO_LATITUDE = -7.04067;

    /**
     * BINGO Central longitude in degrees
     * @constant {number}
     */
    const BINGO_LONGITUDE = -38.26884;

    /**
     * BINGO Central altitude in meters
     * @constant {number}
     */
    const BINGO_ALTITUDE = 396.4;

    // ===================
    // Coordinate Precision
    // ===================

    /**
     * Number of decimal places for coordinate values
     * @constant {number}
     */
    const COORDINATE_PRECISION = 6;

    // ===================
    // Math Constants
    // ===================

    /**
     * Golden angle in radians (for Phyllotaxis layouts)
     * @constant {number}
     */
    const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

    /**
     * Degrees to radians conversion factor
     * @constant {number}
     */
    const DEG_TO_RAD = Math.PI / 180;

    /**
     * Radians to degrees conversion factor
     * @constant {number}
     */
    const RAD_TO_DEG = 180 / Math.PI;

    // ===================
    // Default Configuration
    // ===================

    /**
     * Default maximum placement attempts for random layouts
     * @constant {number}
     */
    const DEFAULT_MAX_PLACEMENT_ATTEMPTS = 10000;

    /**
     * Maximum points for beam pattern plotting
     * @constant {number}
     */
    const MAX_PLOT_POINTS = 2000;

    /**
     * Debounce delay for plot requests (ms)
     * @constant {number}
     */
    const PLOT_DEBOUNCE_DELAY_MS = 300;

    /**
     * Heatmap resolution in pixels
     * @constant {number}
     */
    const HEATMAP_RESOLUTION = 2048;

    // ===================
    // IPFS Configuration
    // ===================

    /**
     * List of IPFS gateway URLs for data retrieval
     * @constant {string[]}
     */
    const IPFS_GATEWAYS = Object.freeze([
        "https://dweb.link/ipfs/",
        "https://ipfs.io/ipfs/",
        "https://gateway.pinata.cloud/ipfs/",
        "https://cloudflare-ipfs.com/ipfs/",
        "https://gateway.ipfs.io/ipfs/"
    ]);

    /**
     * CID for phi-specific E-field data files
     * @constant {string}
     */
    const E_FIELD_PHI_CID = 'bafybeibod4uopaxesmqti3qmonjcbttgxquuby6y6v2uo6sd7ah475bsai';

    /**
     * CID for full 3D E-field data
     * @constant {string}
     */
    const E_FIELD_FULL_CID = 'bafybeicunhz5lwv3nryglwlppu6o6keo7ii3ilntcqtq536aket7qflc34';

    // ===================
    // Map Visualization
    // ===================

    /**
     * Antenna dot radius in meters for map visualization
     * @constant {number}
     */
    const ANTENNA_DOT_RADIUS_M = 0.03;

    /**
     * Tile center dot radius in meters for map visualization
     * @constant {number}
     */
    const TILE_CENTER_DOT_RADIUS_M = 0.05;

    // ===================
    // Public API
    // ===================

    return Object.freeze({
        // Physical Constants
        FREQUENCY_HZ,
        SPEED_OF_LIGHT,
        WAVELENGTH,
        WAVE_NUMBER_K,

        // Tile Dimensions
        TILE_WIDTH_M,
        TILE_HEIGHT_M,
        ANTENNAS_PER_TILE,

        // Antenna Sub-group
        SUBGROUP_COLUMNS,
        SUBGROUP_ROWS,
        SUBGROUP_DX,
        SUBGROUP_DY,
        DIAMOND_OFFSET,

        // BINGO Location
        BINGO_LATITUDE,
        BINGO_LONGITUDE,
        BINGO_ALTITUDE,

        // Precision
        COORDINATE_PRECISION,

        // Math
        GOLDEN_ANGLE_RAD,
        DEG_TO_RAD,
        RAD_TO_DEG,

        // Configuration
        DEFAULT_MAX_PLACEMENT_ATTEMPTS,
        MAX_PLOT_POINTS,
        PLOT_DEBOUNCE_DELAY_MS,
        HEATMAP_RESOLUTION,

        // IPFS
        IPFS_GATEWAYS,
        E_FIELD_PHI_CID,
        E_FIELD_FULL_CID,

        // Map Visualization
        ANTENNA_DOT_RADIUS_M,
        TILE_CENTER_DOT_RADIUS_M
    });

})();

// Export for both browser and Node.js environments
if (typeof window !== 'undefined') {
    window.BingoConstants = BingoConstants;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BingoConstants;
}
