/** 餐次类型：早/中/晚各一天一个，加餐可多个 */
export enum MealType {
  Breakfast = 'breakfast',
  Lunch = 'lunch',
  Dinner = 'dinner',
  Snack = 'snack',
}

/** 餐次整体状态 */
export enum MealSessionStatus {
  NotStarted = 'not_started',
  Ordering = 'ordering',
  PendingProduction = 'pending_production',
  Producing = 'producing',
  PartiallyServed = 'partially_served',
  Served = 'served',
  Cancelled = 'cancelled',
}

/** 个人点菜单状态 */
export enum PersonalOrderStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  Locked = 'locked',
  Archived = 'archived',
  Cancelled = 'cancelled',
}

/** 制作任务状态 */
export enum ProductionTaskStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Producing = 'producing',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Failed = 'failed',
  PartiallyCompleted = 'partially_completed',
}

/** 菜谱状态：归档后不进入点菜候选与随机抽菜，可恢复 */
export enum RecipeStatus {
  Active = 'active',
  Archived = 'archived',
}

/** 社会角色 */
export enum MemberRole {
  Owner = 'owner',
  Member = 'member',
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  [MealType.Breakfast]: '早餐',
  [MealType.Lunch]: '午餐',
  [MealType.Dinner]: '晚餐',
  [MealType.Snack]: '加餐',
}