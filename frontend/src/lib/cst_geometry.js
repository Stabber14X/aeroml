// frontend/src/lib/cst_geometry.js

function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

function combinations(n, k) {
    return factorial(n) / (factorial(k) * factorial(n - k));
}

function bernstein(n, i, x) {
    return combinations(n, i) * Math.pow(x, i) * Math.pow(1 - x, n - i);
}

function classFunction(x, n1, n2) {
    return Math.pow(x, n1) * Math.pow(1 - x, n2);
}

export function generateAirfoilCoordinates(cst, numPoints = 100) {
    const a_upper = cst.a_upper || [];
    const a_lower = cst.a_lower || [];
    const n1 = cst.n1 || 0.5;
    const n2 = cst.n2 || 1.0;
    const dz_te = cst.dz_te || 0;

    const coordinates = [];
    const N_upper = a_upper.length - 1;
    const N_lower = a_lower.length - 1;

    // UPPER SURFACE
    for (let i = 0; i <= numPoints; i++) {
        const beta = (i / numPoints) * Math.PI;
        const x = 0.5 * (1 - Math.cos(beta));
        
        const C = classFunction(x, n1, n2);
        
        let S_upper = 0;
        for (let j = 0; j <= N_upper; j++) {
            S_upper += a_upper[j] * bernstein(N_upper, j, x);
        }

        const y_upper = C * S_upper + (x * dz_te / 2);
        coordinates.push([x, y_upper]);
    }

    // LOWER SURFACE
    const bottomCoords = [];
    for (let i = 0; i <= numPoints; i++) {
        const beta = (i / numPoints) * Math.PI;
        const x = 0.5 * (1 - Math.cos(beta));
        
        const C = classFunction(x, n1, n2);
        
        let S_lower = 0;
        for (let j = 0; j <= N_lower; j++) {
            S_lower += a_lower[j] * bernstein(N_lower, j, x);
        }
        
        // Since a_lower sliders are restricted to NEGATIVE values,
        // S_lower will be negative, and y_lower will naturally be negative (Bottom).
        const y_lower = C * S_lower - (x * dz_te / 2);
        
        bottomCoords.push([x, y_lower]);
    }

    return [...coordinates, ...bottomCoords.reverse()];
}

// --- NEW DEFAULT CONFIGURATION ---
export const NACA4412_CST = {
    a_upper: [0.155, 0.165, 0.150, 0.100, 0.050, 0.020, 0.010, 0.005],
    a_lower: [-0.100, -0.150, -0.130, -0.100, -0.070, -0.040, -0.020, -0.010],
    n1: 0.5, 
    n2: 1.0,
    dz_te: 0,
    alpha: 5.0,
    reynolds: 3000000,
    mach: 0.0,         // Subsonic default
    n_crit: 9.0,       // Standard wind-tunnel turbulence
    xtr_upper: 1.0,    // Natural transition
    xtr_lower: 1.0     // Natural transition
};