/** Accent per content category, so tiles scan by kind at a glance (the name stays the label). */
const CATEGORY_COLORS: Record<string, string> = {
  explosive: '#ff7a2f',
  incendiary: '#ff4a2a',
  submunition: '#ffb35c',
  earthmover: '#c49a6c',
  digger: '#a0785a',
  'terrain-dynamics': '#8fbf6a',
  beam: '#9fd8ff',
  guided: '#c7a0ff',
  roller: '#e0d070',
  mine: '#ff6f91',
  support: '#5fe08a',
  weird: '#d48cff',
  gear: '#4fb3c4',
  driving: '#e8c35a',
};

/** Shop groups: every gear variant ('gear · automatic') shows under Gear. */
export const categoryGroup = (category: string): string =>
  category.startsWith('gear') ? 'gear' : category || 'other';

export const categoryColor = (category: string): string =>
  CATEGORY_COLORS[categoryGroup(category)] ?? '#a8957f';

export const categoryLabel = (category: string): string => category.replace(/-/g, ' ');
