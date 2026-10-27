/** 仅放 UI 层常量；状态枚举以 packages/contracts 为唯一来源 */
export const TAB_PAGES = [
  'pages/home/index',
  'pages/order/index',
  'pages/recipe/index',
  'pages/production/index',
  'pages/stats/index',
]

export const RECIPE_FILTER_GROUPS = [
  { key: 'type', label: '类型', options: ['荤菜', '素菜', '主食', '汤羹'] },
  { key: 'flavor', label: '风味', options: ['麻', '鲜香', '酸', '爽口', '清淡', '下饭'] },
]