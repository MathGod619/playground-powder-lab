export const MATERIALS = ['sand', 'water', 'wall', 'fire', 'oil', 'lava', 'smoke', 'glitter', 'seed', 'speaker', 'rocket', 'brick', 'powder', 'bomb', 'cloud'];
export const SHAPES = ['rect', 'ellipse', 'line', 'tower', 'bridge', 'bomb', 'speaker'];
export const SCENE_NAMES = ['garden', 'volcano', 'city', 'moon', 'sea', 'storm', 'blank'];
const number = (min, max) => ({ type: ['number', 'null'], minimum: min, maximum: max });
export const PLAN_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['title', 'description', 'scene', 'environment', 'operations'],
    properties: {
        title: { type: 'string', minLength: 1, maxLength: 80 }, description: { type: 'string', minLength: 1, maxLength: 500 },
        scene: { enum: [null, ...SCENE_NAMES] },
        environment: { type: 'object', additionalProperties: false,
            required: ['gravity', 'fall', 'wind', 'hue', 'waterColor', 'kick', 'speakers', 'sparks', 'slosh'],
            properties: { gravity: number(.05, 2), fall: number(.05, 1), wind: number(-1, 1), hue: number(0, 360),
                waterColor: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' },
                kick: number(0, 2), speakers: number(0, 2), sparks: number(0, 2), slosh: number(0, 2) } },
        operations: { type: 'array', maxItems: 48, items: { type: 'object', additionalProperties: false,
                required: ['shape', 'material', 'x', 'y', 'w', 'h', 'color'],
                properties: { shape: { enum: SHAPES }, material: { enum: MATERIALS },
                    x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
                    w: { type: 'number', minimum: .005, maximum: 1 }, h: { type: 'number', minimum: .005, maximum: 1 },
                    color: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' } } } },
    },
};
// Validate again in both the bridge and browser. Model output never becomes executable code.
export function validatePlan(value) {
    const exact = (v, keys) => {
        if (!v || typeof v !== 'object' || Array.isArray(v))
            throw new Error('Invalid scene object.');
        const obj = v;
        if (Object.keys(obj).some(k => !keys.includes(k)) || keys.some(k => !(k in obj)))
            throw new Error('Scene contains unsupported fields.');
        return obj;
    };
    const p = exact(structuredClone(value), ['title', 'description', 'scene', 'environment', 'operations']);
    if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 80 || typeof p.description !== 'string' || !p.description.trim() || p.description.length > 500)
        throw new Error('Invalid scene description.');
    if (p.scene !== null && !SCENE_NAMES.includes(p.scene))
        throw new Error('Unsupported scene.');
    const envKeys = ['gravity', 'fall', 'wind', 'hue', 'waterColor', 'kick', 'speakers', 'sparks', 'slosh'];
    const e = exact(p.environment, envKeys);
    // Hue is an angle. Equivalent finite rotations are safe to wrap; physics,
    // operation bounds and all other fields still require their strict ranges.
    if (typeof e.hue === 'number' && Number.isFinite(e.hue))
        e.hue = ((e.hue % 360) + 360) % 360;
    const color = (v) => v === null || typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    const bounded = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    for (const [key, lo, hi] of [['gravity', .05, 2], ['fall', .05, 1], ['wind', -1, 1], ['hue', 0, 360], ['kick', 0, 2], ['speakers', 0, 2], ['sparks', 0, 2], ['slosh', 0, 2]]) {
        if (e[key] !== null && !bounded(e[key], lo, hi))
            throw new Error('Environment value is out of range: ' + key);
    }
    if (!color(e.waterColor) || !Array.isArray(p.operations) || p.operations.length > 48)
        throw new Error('Invalid scene operations.');
    for (const raw of p.operations) {
        const o = exact(raw, ['shape', 'material', 'x', 'y', 'w', 'h', 'color']);
        if (!SHAPES.includes(o.shape) || !MATERIALS.includes(o.material) || !color(o.color))
            throw new Error('Unsupported scene tool.');
        if (!bounded(o.x, 0, 1) || !bounded(o.y, 0, 1) || !bounded(o.w, .005, 1) || !bounded(o.h, .005, 1))
            throw new Error('Scene coordinates are out of range.');
    }
    return structuredClone(p);
}
export const EMPTY_ENV = { gravity: null, fall: null, wind: null, hue: null, waterColor: null, kick: null, speakers: null, sparks: null, slosh: null };
export const EXAMPLE_PLAN = { title: 'Neon demolition stage', description: 'Two brick towers, a bridge, speakers and drop-triggered charges. Example template; no AI request.',
    scene: 'blank', environment: { ...EMPTY_ENV, hue: 285, gravity: .7, speakers: 1.5 },
    operations: [
        { shape: 'tower', material: 'brick', x: .18, y: .36, w: .14, h: .52, color: '#985bd9' },
        { shape: 'tower', material: 'brick', x: .68, y: .36, w: .14, h: .52, color: '#24bec5' },
        { shape: 'bridge', material: 'brick', x: .3, y: .48, w: .4, h: .035, color: '#dd67ba' },
        { shape: 'bomb', material: 'bomb', x: .23, y: .85, w: .01, h: .01, color: null },
        { shape: 'bomb', material: 'bomb', x: .74, y: .85, w: .01, h: .01, color: null },
    ] };
