import { EMPTY_ENV, validatePlan } from './director-plan.mjs'

const object = (shape, material, x, y, w, h, color) => ({ shape, material, x, y, w, h, color })
const RECIPES = {
  aquarium: { title: 'Prismatic aquarium', description: 'A contained tank with three branching plants, rock clusters, a stone arch, air pockets and stereo speaker stacks. Plants hold their shape and grow to the beat; water and sand move with the music.',
    scene: 'blank', environment: { ...EMPTY_ENV, hue: 190, kick: .65, speakers: .8, sparks: .7, slosh: .9 },
    operations: [object('aquarium', 'wall', .1, .08, .8, .82, '#184b72'),
      object('speaker-stack', 'speaker', .015, .63, .065, .3, '#52e8d3'),
      object('speaker-stack', 'speaker', .92, .63, .065, .3, '#e47ae5')] },
  skyline: { title: 'Afterhours skyline', description: 'A layered city with lit windows, rooftop antennas, a brick arch and stereo speaker stacks. Buildings stay upright until a blast damages them.',
    scene: 'blank', environment: { ...EMPTY_ENV, hue: 285, kick: 1, speakers: 1.2, sparks: 1.2 },
    operations: [object('terrain', 'wall', 0, .88, 1, .12, '#4e426b'),
      ...[.09, .24, .39, .61, .77].map((x, i) => object('building', 'brick', x, [.35, .2, .42, .26, .4][i], .13, [.56, .71, .49, .65, .51][i], ['#72639f', '#7c508f', '#506c94', '#735fa3', '#59758e'][i])),
      object('arch', 'brick', .46, .68, .18, .23, '#a37bbd'),
      object('speaker-stack', 'speaker', .02, .69, .06, .22, '#55e8d2'),
      object('speaker-stack', 'speaker', .92, .69, .06, .22, '#f27ed5')] },
  'moon-garden': { title: 'Lunar conservatory', description: 'Terraced moon rock, branching bioluminescent plants and two arches. Low gravity lets the sandy surface float with the bass.',
    scene: 'blank', environment: { ...EMPTY_ENV, hue: 245, gravity: .28, fall: .45, kick: .85, speakers: .9, sparks: 1.2 },
    operations: [object('terrain', 'wall', 0, .78, 1, .22, '#665475'),
      object('rock', 'wall', .04, .65, .2, .22, '#716891'), object('rock', 'wall', .74, .64, .22, .23, '#786991'),
      object('arch', 'wall', .3, .48, .22, .36, '#9881b5'), object('arch', 'wall', .57, .59, .14, .25, '#7879a9'),
      object('plant', 'seed', .14, .36, .15, .48, '#5ee4d0'), object('plant', 'seed', .5, .3, .17, .54, '#e189dd'),
      object('plant', 'seed', .73, .48, .14, .36, '#adcf7c'),
      object('speaker-stack', 'speaker', .025, .6, .06, .23, '#6ef2de'),
      object('speaker-stack', 'speaker', .91, .6, .06, .23, '#d5a1f4')] },
}

export const SCENE_RECIPES = [
  { id: 'aquarium', name: 'Prismatic aquarium' },
  { id: 'skyline', name: 'Afterhours skyline' },
  { id: 'moon-garden', name: 'Lunar conservatory' },
]
export function getRecipe(id) {
  if (!Object.hasOwn(RECIPES, id)) throw Error('Unknown scene starter.')
  return validatePlan(RECIPES[id])
}
// The model supplies additions to a selected foundation. A small response can
// no longer accidentally erase the detailed starting scene.
export function withRecipe(input, id) {
  const plan = validatePlan(input), base = getRecipe(id)
  const environment = Object.fromEntries(Object.entries(base.environment).map(([key, value]) => [key, plan.environment[key] ?? value]))
  return validatePlan({ ...plan, scene: base.scene, environment, operations: [...base.operations, ...plan.operations] })
}
