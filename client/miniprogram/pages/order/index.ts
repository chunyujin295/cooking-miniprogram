import { BASE_URL } from '../../config/env'
import {
  createMealSession,
  deleteMealSession,
  getMealSession,
  listMealSessions,
  MEAL_STATUS_LABEL,
  saveMyOrder,
  submitMyOrder,
  type MealSessionDetailView,
  type MealSessionView,
  type MealType,
} from '../../services/meal'
import {
  listRecipes,
  listTags,
  type RecipeListItemView,
  type TagView,
} from '../../services/recipe'
import { checkDietary } from '../../services/dietary'
import { session as authSession } from '../../store/session'
import { toDateKey } from '../../utils/date'

interface DishRow extends RecipeListItemView {
  cover: string
}

interface PickRow {
  recipeId: string
  name: string
  quantity: number
  note: string
}

interface TagChip extends TagView {
  selected: boolean
}

const TABS: Array<{ type: MealType; label: string }> = [
  { type: 'breakfast', label: '早餐' },
  { type: 'lunch', label: '午餐' },
  { type: 'dinner', label: '晚餐' },
  { type: 'snack', label: '加餐' },
]

function defaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 10) {
    return 'breakfast'
  }
  return hour < 15 ? 'lunch' : 'dinner'
}

/** 用于判断"提交后是否又改过"，决定提交按钮是否可点 */
function signature(picked: PickRow[], note: string): string {
  const items = picked
    .map((item) => [item.recipeId, item.quantity, item.note.trim()].join('|'))
    .sort()
  return JSON.stringify({ note: note.trim(), items })
}

Page({
  data: {
    date: toDateKey(),
    dateOptions: [
      { key: toDateKey(), label: '今天' },
      { key: toDateKey(new Date(Date.now() + 86400000)), label: '明天' },
    ],
    tabs: TABS,
    mealType: defaultMealType() as MealType,
    sessions: [] as MealSessionView[],
    snackSessions: [] as MealSessionView[],
    sessionId: '',
    detail: null as MealSessionDetailView | null,
    statusLabel: '',
    recipes: [] as DishRow[],
    tags: [] as TagChip[],
    qtyMap: {} as Record<string, number>,
    picked: [] as PickRow[],
    totalQty: 0,
    keyword: '',
    note: '',
    snapshot: '',
    dirty: false,
    allergenMap: {} as Record<string, string>,
    loading: false,
    saving: false,
    error: '',
  },

  keywordTimer: 0,

  onLoad(options: Record<string, string | undefined>) {
    this.setData({
      date: options.date || toDateKey(),
      mealType: (options.mealType as MealType | undefined) ?? defaultMealType(),
    })
  },

  onShow() {
    if (!authSession.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    const nav = wx.getStorageSync('orderNav') as
      | { date?: string; mealType?: MealType }
      | ''
    let forceReload = false
    if (nav && nav.date) {
      wx.removeStorageSync('orderNav')
      this.setData({
        date: nav.date,
        mealType: nav.mealType ?? this.data.mealType,
      })
      forceReload = true
    }
    // 从菜谱详情返回时不清空尚未提交的选择
    void this.bootstrap(!forceReload)
  },

  async bootstrap(preserveLocal = false) {
    this.setData({ loading: true, error: '' })
    try {
      const [sessions, tags, dishes] = await Promise.all([
        listMealSessions(this.data.date),
        listTags(),
        this.fetchDishes(),
      ])
      this.setData({
        sessions,
        snackSessions: sessions.filter((item) => item.mealType === 'snack'),
        tags: tags.map((tag) => ({
          ...tag,
          selected: this.data.tags.some((item) => item.id === tag.id && item.selected),
        })),
        recipes: dishes,
      })
      if (preserveLocal && this.data.dirty && this.data.sessionId) {
        this.setData({ loading: false })
        return
      }
      await this.selectType(this.data.mealType)
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async fetchDishes(): Promise<DishRow[]> {
    const tagIds = this.data.tags.filter((tag) => tag.selected).map((tag) => tag.id)
    const list = await listRecipes({ keyword: this.data.keyword.trim(), tagIds })
    return list.map((item) => ({
      ...item,
      cover: item.coverUrl ? `${BASE_URL}${item.coverUrl}` : '',
    }))
  },

  async selectType(type: MealType) {
    this.setData({
      mealType: type,
      sessionId: '',
      detail: null,
      qtyMap: {},
      picked: [],
      totalQty: 0,
      note: '',
      snapshot: '',
      dirty: false,
      statusLabel: '',
    })

    if (type === 'snack') {
      // 加餐可多个实例，先让用户选一个或新建；不走 loadDetail，需要手动收掉 loading
      this.setData({ loading: false })
      return
    }

    let target = this.data.sessions.find((item) => item.mealType === type)
    if (!target) {
      target = await createMealSession(this.data.date, type)
      this.setData({ sessions: [...this.data.sessions, target] })
    }
    await this.loadDetail(target.id)
  },

  async loadDetail(sessionId: string) {
    this.setData({ loading: true, error: '' })
    try {
      const detail = await getMealSession(sessionId)
      const qtyMap: Record<string, number> = {}
      const picked: PickRow[] = []
      for (const item of detail.myOrder?.items ?? []) {
        qtyMap[item.recipeId] = (qtyMap[item.recipeId] ?? 0) + item.quantity
        picked.push({
          recipeId: item.recipeId,
          name: item.name,
          quantity: item.quantity,
          note: item.note ?? '',
        })
      }
      const note = detail.myOrder?.note ?? ''

      this.setData({
        sessionId,
        detail,
        qtyMap,
        picked,
        totalQty: Object.values(qtyMap).reduce((sum, value) => sum + value, 0),
        note,
        snapshot: signature(picked, note),
        dirty: false,
        statusLabel: MEAL_STATUS_LABEL[detail.session.status] ?? detail.session.status,
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onDateTap(e: WechatMiniprogram.TouchEvent) {
    const date = e.currentTarget.dataset.key as string
    if (date === this.data.date) {
      return
    }
    this.setData({ date })
    void this.bootstrap()
  },

  onDatePick(e: WechatMiniprogram.PickerChange) {
    this.setData({ date: String(e.detail.value) })
    void this.bootstrap()
  },

  onTabTap(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as MealType
    if (type === this.data.mealType && this.data.sessionId) {
      return
    }
    void this.selectType(type)
  },

  async onAddSnack() {
    try {
      const created = await createMealSession(this.data.date, 'snack')
      const sessions = mergeSession(this.data.sessions, created)
      this.setData({
        sessions,
        snackSessions: sessions.filter((item) => item.mealType === 'snack'),
      })
      await this.loadDetail(created.id)
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '新增加餐失败' })
    }
  },

  async onOpenSnack(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    await this.loadDetail(id)
  },

  /** 删除还没有人提交的空加餐，避免堆积 */
  onDeleteSnack(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.showModal({
      title: '删除加餐',
      content: '这顿加餐还没有人提交，删除后不可恢复。确定吗？',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          await deleteMealSession(id)
          const sessions = this.data.sessions.filter((item) => item.id !== id)
          const wasOpen = this.data.sessionId === id
          this.setData({
            sessions,
            snackSessions: sessions.filter((item) => item.mealType === 'snack'),
            ...(wasOpen
              ? { sessionId: '', detail: null, picked: [], qtyMap: {}, totalQty: 0, note: '' }
              : {}),
          })
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          this.setData({ error: err instanceof Error ? err.message : '删除失败' })
        }
      },
    })
  },

  /** 加餐是二级视图，返回加餐列表 */
  onBackToSnacks() {
    this.setData({
      sessionId: '',
      detail: null,
      qtyMap: {},
      picked: [],
      totalQty: 0,
      note: '',
      snapshot: '',
      dirty: false,
      statusLabel: '',
    })
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer)
    }
    this.keywordTimer = setTimeout(() => {
      void this.refreshDishes()
    }, 300) as unknown as number
  },

  async refreshDishes() {
    try {
      const recipes = await this.fetchDishes()
      this.setData({ recipes })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onToggleTag(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    this.setData(
      {
        tags: this.data.tags.map((tag) =>
          tag.id === id ? { ...tag, selected: !tag.selected } : tag,
        ),
      },
      () => {
        void this.refreshDishes()
      },
    )
  },

  refreshDirty() {
    this.setData({ dirty: signature(this.data.picked, this.data.note) !== this.data.snapshot })
  },

  applyQty(recipeId: string, quantity: number) {
    const qtyMap = { ...this.data.qtyMap }
    let picked = this.data.picked.slice()

    if (quantity <= 0) {
      delete qtyMap[recipeId]
      picked = picked.filter((item) => item.recipeId !== recipeId)
    } else {
      qtyMap[recipeId] = quantity
      const existing = picked.find((item) => item.recipeId === recipeId)
      if (existing) {
        picked = picked.map((item) =>
          item.recipeId === recipeId ? { ...item, quantity } : item,
        )
      } else {
        const name = this.data.recipes.find((item) => item.id === recipeId)?.name ?? ''
        picked = [...picked, { recipeId, name, quantity, note: '' }]
      }
    }

    this.setData(
      {
        qtyMap,
        picked,
        totalQty: Object.values(qtyMap).reduce((sum, value) => sum + value, 0),
      },
      () => this.refreshDirty(),
    )
  },

  /** 点缩略图看做法；用 catchtap 的 +/- 不会触发这里 */
  onOpenRecipe(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/recipe/detail/index?id=${id}` })
  },

  onDishAdd(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.detail?.canEdit) {
      return
    }
    const id = e.currentTarget.dataset.id as string
    const next = (this.data.qtyMap[id] ?? 0) + 1
    this.applyQty(id, next)
    if (next === 1) {
      void this.checkAllergen(id)
    }
  },

  /** 命中本人过敏原/忌口时提示，不阻断点菜 */
  async checkAllergen(recipeId: string) {
    if (this.data.allergenMap[recipeId]) {
      return
    }
    try {
      const [hit] = await checkDietary([recipeId])
      if (!hit) {
        return
      }
      const text = hit.matched.join('、')
      this.setData({
        allergenMap: { ...this.data.allergenMap, [recipeId]: text },
      })
      wx.showModal({
        title: '忌口提醒',
        content: `${hit.name} 含 ${text}，与你的过敏原/忌口冲突`,
        showCancel: false,
        confirmText: '知道了',
      })
    } catch {
      // 提示失败不影响点菜
    }
  },

  onDishRemove(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.detail?.canEdit) {
      return
    }
    const id = e.currentTarget.dataset.id as string
    this.applyQty(id, (this.data.qtyMap[id] ?? 0) - 1)
  },

  onPickRemove(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.detail?.canEdit) {
      return
    }
    const index = Number(e.currentTarget.dataset.index)
    const target = this.data.picked[index]
    if (target) {
      this.applyQty(target.recipeId, 0)
    }
  },

  onPickMinus(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.detail?.canEdit) {
      return
    }
    const index = Number(e.currentTarget.dataset.index)
    const target = this.data.picked[index]
    if (target) {
      this.applyQty(target.recipeId, target.quantity - 1)
    }
  },

  onPickPlus(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.detail?.canEdit) {
      return
    }
    const index = Number(e.currentTarget.dataset.index)
    const target = this.data.picked[index]
    if (target) {
      this.applyQty(target.recipeId, target.quantity + 1)
    }
  },

  onPickNote(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index)
    const picked = this.data.picked.map((item, i) =>
      i === index ? { ...item, note: e.detail.value } : item,
    )
    this.setData({ picked }, () => this.refreshDirty())
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value }, () => this.refreshDirty())
  },

  async onSubmit() {
    if (this.data.saving || !this.data.sessionId) {
      return
    }
    if (this.data.picked.length === 0) {
      this.setData({ error: '至少选一道菜' })
      return
    }
    if (!this.data.dirty) {
      return
    }

    this.setData({ saving: true, error: '' })
    try {
      await saveMyOrder(this.data.sessionId, {
        note: this.data.note.trim() || undefined,
        items: this.data.picked.map((item) => ({
          recipeId: item.recipeId,
          quantity: item.quantity,
          note: item.note.trim() || undefined,
        })),
      })
      await submitMyOrder(this.data.sessionId)
      wx.showToast({ title: '已提交给家人', icon: 'success' })
      const sessions = await listMealSessions(this.data.date)
      this.setData({ sessions, snackSessions: sessions.filter((i) => i.mealType === 'snack') })
      await this.loadDetail(this.data.sessionId)
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '提交失败' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onOpenSummary() {
    if (!this.data.sessionId) {
      return
    }
    wx.navigateTo({ url: `/pages/order/summary/index?id=${this.data.sessionId}` })
  },
})

function mergeSession(
  list: MealSessionView[],
  session: MealSessionView,
): MealSessionView[] {
  const exists = list.some((item) => item.id === session.id)
  return exists ? list.map((item) => (item.id === session.id ? session : item)) : [...list, session]
}
