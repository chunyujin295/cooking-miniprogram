import { BASE_URL } from '../../config/env'
import {
  listRecipes,
  listTags,
  type RecipeListItemView,
  type TagView,
} from '../../services/recipe'
import { session } from '../../store/session'

interface CardView extends RecipeListItemView {
  cover: string
}

interface TagChip extends TagView {
  selected: boolean
}

Page({
  data: {
    keyword: '',
    showArchived: false,
    tags: [] as TagChip[],
    recipes: [] as CardView[],
    loading: true,
    error: '',
  },

  keywordTimer: 0,

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    void this.reload()
  },

  async onPullDownRefresh() {
    await this.reload()
    wx.stopPullDownRefresh()
  },

  async reload() {
    this.setData({ loading: true, error: '' })
    try {
      const [tags, recipes] = await Promise.all([listTags(), this.fetchRecipes()])
      this.setData({
        tags: tags.map((tag) => ({ ...tag, selected: this.data.tags.some((t) => t.id === tag.id && t.selected) })),
        recipes,
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async fetchRecipes(): Promise<CardView[]> {
    const activeTagIds = this.data.tags.filter((tag) => tag.selected).map((tag) => tag.id)
    const list = await listRecipes({
      keyword: this.data.keyword.trim(),
      tagIds: activeTagIds,
      // 一次取全，再按「在用 / 已归档」过滤，避免两个视图各自漏数据
      includeArchived: true,
    })
    return list
      .filter((item) => item.isArchived === this.data.showArchived)
      .map((item) => ({
        ...item,
        cover: item.coverUrl ? `${BASE_URL}${item.coverUrl}` : '',
      }))
  },

  async refreshList() {
    this.setData({ loading: true, error: '' })
    try {
      const recipes = await this.fetchRecipes()
      this.setData({ recipes, loading: false })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer)
    }
    this.keywordTimer = setTimeout(() => {
      void this.refreshList()
    }, 300) as unknown as number
  },

  onToggleTag(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    this.setData(
      {
        tags: this.data.tags.map((tag) => (tag.id === id ? { ...tag, selected: !tag.selected } : tag)),
      },
      () => {
        void this.refreshList()
      },
    )
  },

  onScopeTap(e: WechatMiniprogram.TouchEvent) {
    const showArchived = e.currentTarget.dataset.archived === '1'
    if (showArchived === this.data.showArchived) {
      return
    }
    this.setData({ showArchived }, () => {
      void this.refreshList()
    })
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/recipe/edit/index' })
  },

  onImport() {
    wx.navigateTo({ url: '/pages/recipe/import/index' })
  },

  onOpen(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/recipe/detail/index?id=${id}` })
  },
})
