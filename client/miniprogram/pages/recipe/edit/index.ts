import { BASE_URL } from '../../../config/env'
import { saveRecipeNutrition, type SaveNutritionPayload } from '../../../services/nutrition'
import {
  chooseAndUploadImages,
  createRecipe,
  createTag,
  deleteRecipe,
  getRecipe,
  listTags,
  updateRecipe,
} from '../../../services/recipe'
import type { NutritionDraft, RecipeDraft } from '../../../utils/recipeDraft'
import { freshness } from '../../../store/freshness'

interface ImageItem {
  key: string
  url: string
}

interface TagChip {
  id: string
  name: string
  selected: boolean
}

interface IngredientRow {
  name: string
  quantity: string
  unit: string
}

interface StepRow {
  content: string
}

type NumberField = 'baseServings' | 'prepMinutes' | 'cookMinutes'
type IngredientField = 'name' | 'quantity' | 'unit'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

Page({
  data: {
    id: '',
    fromExternal: false,
    importWarnings: [] as string[],
    name: '',
    description: '',
    baseServings: 2,
    prepMinutes: 10,
    cookMinutes: 20,
    months: MONTHS.map((month) => ({ month, on: false })),
    images: [] as ImageItem[],
    tags: [] as TagChip[],
    newTag: '',
    ingredients: [{ name: '', quantity: '', unit: '' }] as IngredientRow[],
    steps: [{ content: '' }] as StepRow[],
    uploading: false,
    loading: true,
    saving: false,
    deleting: false,
    error: '',
  },

  pendingDraft: null as RecipeDraft | null,
  pendingNutrition: null as NutritionDraft | null,

  onLoad(options: Record<string, string | undefined>) {
    const fromExternal = options.fromExternal === '1'
    this.setData({ id: options.id ?? '', fromExternal })
    // 整理页解析成功后把草稿放进本地存储，这里取一次即清，避免下次误预填
    const draft = wx.getStorageSync('recipeDraft') as RecipeDraft | undefined
    if (draft) {
      wx.removeStorageSync('recipeDraft')
      this.pendingDraft = draft
      wx.setNavigationBarTitle({ title: '核对整理结果' })
    }
    const nutrition = wx.getStorageSync('recipeNutritionDraft') as NutritionDraft | undefined
    if (nutrition) {
      wx.removeStorageSync('recipeNutritionDraft')
      this.pendingNutrition = nutrition
    }
    void this.init()
  },

  async init() {
    try {
      const tags = await listTags()
      const chips: TagChip[] = tags.map((tag) => ({ id: tag.id, name: tag.name, selected: false }))

      if (!this.data.id) {
        this.setData({
          tags: chips,
          loading: false,
          ...(this.pendingDraft ? draftToData(this.pendingDraft) : {}),
        })
        return
      }

      wx.setNavigationBarTitle({ title: '编辑菜谱' })
      const recipe = await getRecipe(this.data.id)
      this.setData({
        name: recipe.name,
        description: recipe.description ?? '',
        baseServings: recipe.baseServings,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        months: MONTHS.map((month) => ({ month, on: recipe.seasonMonths.includes(month) })),
        images: recipe.imageUrls.map((key, index) => ({
          key,
          url: `${BASE_URL}${recipe.images[index] ?? ''}`,
        })),
        tags: chips.map((chip) => ({ ...chip, selected: recipe.tagIds.includes(chip.id) })),
        ingredients: recipe.ingredients.length
          ? recipe.ingredients
          : [{ name: '', quantity: '', unit: '' }],
        steps: recipe.steps.length
          ? recipe.steps.map((step) => ({ content: step.content }))
          : [{ content: '' }],
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as 'name' | 'description'
    this.setData({ [field]: e.detail.value })
  },

  onNumberInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as NumberField
    const value = Math.max(0, Number(e.detail.value) || 0)
    this.setData({ [field]: value })
  },

  onMonthToggle(e: WechatMiniprogram.TouchEvent) {
    const month = Number(e.currentTarget.dataset.month)
    this.setData({
      months: this.data.months.map((item) =>
        item.month === month ? { ...item, on: !item.on } : item,
      ),
    })
  },

  async onAddImages() {
    if (this.data.uploading) {
      return
    }
    this.setData({ uploading: true, error: '' })
    try {
      const uploaded = await chooseAndUploadImages(9)
      this.setData({
        images: [
          ...this.data.images,
          ...uploaded.map((item) => ({ key: item.key, url: `${BASE_URL}${item.url}` })),
        ],
      })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '上传失败' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  onRemoveImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ images: this.data.images.filter((_, i) => i !== index) })
  },

  onToggleTag(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    this.setData({
      tags: this.data.tags.map((tag) => (tag.id === id ? { ...tag, selected: !tag.selected } : tag)),
    })
  },

  onNewTagInput(e: WechatMiniprogram.Input) {
    this.setData({ newTag: e.detail.value })
  },

  async onAddTag() {
    const name = this.data.newTag.trim()
    if (!name) {
      return
    }
    try {
      const tag = await createTag(name)
      this.setData({
        tags: [
          ...this.data.tags.filter((item) => item.id !== tag.id),
          { id: tag.id, name: tag.name, selected: true },
        ],
        newTag: '',
      })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '新建标签失败' })
    }
  },

  onIngredientInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field as IngredientField
    const next = this.data.ingredients.slice()
    const current = next[index]
    if (!current) {
      return
    }
    const patched: IngredientRow = { ...current }
    patched[field] = e.detail.value
    next[index] = patched
    this.setData({ ingredients: next })
  },

  onAddIngredient() {
    this.setData({ ingredients: [...this.data.ingredients, { name: '', quantity: '', unit: '' }] })
  },

  onRemoveIngredient(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const next = this.data.ingredients.filter((_, i) => i !== index)
    this.setData({ ingredients: next.length ? next : [{ name: '', quantity: '', unit: '' }] })
  },

  onStepInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index)
    const next = this.data.steps.slice()
    next[index] = { content: e.detail.value }
    this.setData({ steps: next })
  },

  onAddStep() {
    this.setData({ steps: [...this.data.steps, { content: '' }] })
  },

  onRemoveStep(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const next = this.data.steps.filter((_, i) => i !== index)
    this.setData({ steps: next.length ? next : [{ content: '' }] })
  },

  /** 删除需要二次确认；有历史点菜记录的菜谱会被服务端拒绝，提示改用归档 */
  onDelete() {
    if (!this.data.id || this.data.deleting) {
      return
    }
    wx.showModal({
      title: '删除菜谱',
      content: '删除后无法恢复。已有历史点菜或出餐记录的菜谱不能删除，可以改为归档。',
      confirmText: '删除',
      confirmColor: '#a33',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        this.setData({ deleting: true, error: '' })
        try {
          await deleteRecipe(this.data.id)
          freshness.invalidate('recipe', 'order', 'stats', 'home')
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.switchTab({ url: '/pages/recipe/index' }), 600)
        } catch (err) {
          this.setData({ error: err instanceof Error ? err.message : '删除失败' })
        } finally {
          this.setData({ deleting: false })
        }
      },
    })
  },

  async onSave() {
    if (this.data.saving) {
      return
    }

    const name = this.data.name.trim()
    const ingredients = this.data.ingredients
      .map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity.trim(),
        unit: item.unit.trim(),
      }))
      .filter((item) => item.name.length > 0)
    const steps = this.data.steps
      .map((step) => ({ content: step.content.trim() }))
      .filter((step) => step.content.length > 0)

    if (!name) {
      this.setData({ error: '请填写菜名' })
      return
    }
    if (ingredients.length === 0) {
      this.setData({ error: '至少填写一种食材' })
      return
    }
    if (steps.length === 0) {
      this.setData({ error: '至少填写一个步骤' })
      return
    }

    const payload = {
      name,
      description: this.data.description.trim() || undefined,
      baseServings: Number(this.data.baseServings) || 1,
      prepMinutes: Number(this.data.prepMinutes) || 0,
      cookMinutes: Number(this.data.cookMinutes) || 0,
      seasonMonths: this.data.months.filter((item) => item.on).map((item) => item.month),
      imageUrls: this.data.images.map((item) => item.key),
      tagIds: this.data.tags.filter((tag) => tag.selected).map((tag) => tag.id),
      ingredients,
      steps,
      source: this.data.fromExternal ? ('external-ai' as const) : ('manual' as const),
    }

    this.setData({ saving: true, error: '' })
    try {
      if (this.data.id) {
        await updateRecipe(this.data.id, payload)
        freshness.invalidate('recipe', 'order', 'stats')
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      } else {
        const created = await createRecipe(payload)
        if (this.pendingNutrition) {
          // 营养值随模板一起导入，失败不阻断保存
          await saveRecipeNutrition(created.id, this.pendingNutrition as SaveNutritionPayload).catch(
            () => undefined,
          )
        }
        freshness.invalidate('recipe', 'order', 'stats')
        wx.showToast({ title: '已创建', icon: 'success' })
        wx.redirectTo({ url: `/pages/recipe/detail/index?id=${created.id}` })
      }
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '保存失败' })
    } finally {
      this.setData({ saving: false })
    }
  },
})

/** AI 草稿 → 表单字段；空数组补一行空输入，保持页面可编辑 */
function draftToData(draft: RecipeDraft) {
  return {
    name: draft.name,
    description: draft.description ?? '',
    baseServings: draft.baseServings,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    months: MONTHS.map((month) => ({ month, on: draft.seasonMonths.includes(month) })),
    ingredients: draft.ingredients.length
      ? draft.ingredients
      : [{ name: '', quantity: '', unit: '' }],
    steps: draft.steps.length ? draft.steps : [{ content: '' }],
    importWarnings: draft.warnings,
  }
}
