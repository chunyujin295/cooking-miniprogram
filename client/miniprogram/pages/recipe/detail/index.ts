import { BASE_URL } from '../../../config/env'
import { confirmRecipeNutrition } from '../../../services/nutrition'
import {
  archiveRecipe,
  getRecipe,
  restoreRecipe,
  type RecipeDetailView,
} from '../../../services/recipe'

interface DetailView extends RecipeDetailView {
  imagesAbs: string[]
  stepList: Array<{ stepNo: number; content: string; image: string | null }>
}

Page({
  data: {
    id: '',
    recipe: null as DetailView | null,
    loading: true,
    error: '',
    busy: false,
    confirming: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (this.data.id) {
      void this.load()
    }
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const recipe = await getRecipe(this.data.id)
      this.setData({
        recipe: {
          ...recipe,
          imagesAbs: recipe.images.map((path) => `${BASE_URL}${path}`),
          stepList: recipe.steps.map((step) => ({
            stepNo: step.stepNo,
            content: step.content,
            image: step.imageUrl ? `${BASE_URL}${step.imageUrl}` : null,
          })),
        },
        loading: false,
      })
      wx.setNavigationBarTitle({ title: recipe.name })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/recipe/edit/index?id=${this.data.id}` })
  },

  async onConfirmNutrition() {
    if (this.data.confirming || !this.data.recipe) {
      return
    }
    this.setData({ confirming: true, error: '' })
    try {
      const nutrition = await confirmRecipeNutrition(this.data.id)
      this.setData({ 'recipe.nutrition': nutrition })
      wx.showToast({ title: '已确认', icon: 'success' })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '确认失败' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onToggleArchive() {
    const recipe = this.data.recipe
    if (!recipe || this.data.busy) {
      return
    }
    this.setData({ busy: true })
    try {
      if (recipe.isArchived) {
        await restoreRecipe(recipe.id)
        wx.showToast({ title: '已恢复', icon: 'success' })
      } else {
        await archiveRecipe(recipe.id)
        wx.showToast({ title: '已归档', icon: 'success' })
      }
      await this.load()
    } catch (err) {
      wx.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
})
