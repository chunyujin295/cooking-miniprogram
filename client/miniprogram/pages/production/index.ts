import {
  acceptTask,
  completeTaskItem,
  listProductionTasks,
  serveTask,
  startTask,
  TASK_STATUS_LABEL,
  type ProductionTaskView,
  type TaskItemView,
} from '../../services/production'
import { session } from '../../store/session'
import { freshness } from '../../store/freshness'

interface ItemRow extends TaskItemView {
  sourceText: string
}

interface TaskRow extends ProductionTaskView {
  statusText: string
  assigneeText: string
  /** 只有开始制作后才允许逐道点「完成」 */
  started: boolean
  items: ItemRow[]
}

Page({
  data: {
    loggedIn: session.hasToken(),
    scope: 'active' as 'active' | 'all',
    tasks: [] as TaskRow[],
    loading: true,
    busyId: '',
    error: '',
  },

  onShow() {
    const loggedIn = session.hasToken()
    if (loggedIn !== this.data.loggedIn) {
      this.setData({ loggedIn })
    }
    if (!loggedIn) {
      return
    }
    if (!freshness.stale('production')) {
      return
    }
    void this.load()
  },

  async onPullDownRefresh() {
    if (this.data.loggedIn) {
      await this.load()
    }
    wx.stopPullDownRefresh()
  },

  onGuestLogin() {
    wx.navigateTo({ url: '/pages/auth/login/index' })
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const tasks = await listProductionTasks(this.data.scope)
      this.setData({ tasks: tasks.map(toRow), loading: false })
      freshness.touch('production')
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onScopeTap(e: WechatMiniprogram.TouchEvent) {
    const scope = e.currentTarget.dataset.scope as 'active' | 'all'
    if (scope === this.data.scope) {
      return
    }
    this.setData({ scope }, () => {
      void this.load()
    })
  },

  async onAccept(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    await this.runAction(id, () => acceptTask(id), '已接单')
  },

  async onStart(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    await this.runAction(id, () => startTask(id), '开始制作')
  },

  async onServe(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    await this.runAction(id, () => serveTask(id), '已出餐')
  },

  onOpenShopping(e: WechatMiniprogram.TouchEvent) {
    const sessionId = e.currentTarget.dataset.session as string
    wx.navigateTo({ url: `/pages/shopping/index?sessionId=${sessionId}` })
  },

  async onCompleteItem(e: WechatMiniprogram.TouchEvent) {
    const taskId = e.currentTarget.dataset.task as string
    const itemId = e.currentTarget.dataset.item as string
    await this.runAction(taskId, () => completeTaskItem(taskId, itemId), '这道菜好了')
  },

  async runAction(id: string, action: () => Promise<ProductionTaskView>, toast: string) {
    if (this.data.busyId) {
      return
    }
    this.setData({ busyId: id, error: '' })
    try {
      await action()
      // 接单/出餐会改变首页与统计的汇总
      freshness.invalidate('home', 'stats')
      wx.showToast({ title: toast, icon: 'success' })
      await this.load()
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '操作失败' })
    } finally {
      this.setData({ busyId: '' })
    }
  },
})

function toRow(task: ProductionTaskView): TaskRow {
  return {
    ...task,
    statusText: TASK_STATUS_LABEL[task.status] ?? task.status,
    assigneeText: task.assigneeName ? `负责人 ${task.assigneeName}` : '待认领',
    started: task.status === 'producing' || task.status === 'partially_completed',
    items: task.items.map((item) => ({
      ...item,
      sourceText: item.sources.map((s) => `${s.memberName} ${s.quantity}份`).join(' · '),
    })),
  }
}
