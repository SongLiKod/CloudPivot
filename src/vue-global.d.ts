/**
 * Vant 4 全局组件类型增强
 * 本文件通过顶部 import 声明为「模块」上下文，使下方 declare module 'vue'
 * 作为 module augmentation 与真实 vue 类型合并，而不是遮蔽它。
 * （注意：不能在 env.d.ts（全局 script）中写 declare module 'vue'，会污染 vue 解析）
 */
import 'vant/lib/index.css'

declare module 'vue' {
  export interface GlobalComponents {
    VanButton: typeof import('vant')['Button']
    VanCell: typeof import('vant')['Cell']
    VanCellGroup: typeof import('vant')['CellGroup']
    VanField: typeof import('vant')['Field']
    VanPopup: typeof import('vant')['Popup']
    VanTag: typeof import('vant')['Tag']
    VanIcon: typeof import('vant')['Icon']
    VanSearch: typeof import('vant')['Search']
    VanEmpty: typeof import('vant')['Empty']
    VanRadioGroup: typeof import('vant')['RadioGroup']
    VanRadio: typeof import('vant')['Radio']
    VanSwitch: typeof import('vant')['Switch']
    VanActionSheet: typeof import('vant')['ActionSheet']
    VanProgress: typeof import('vant')['Progress']
    VanNavBar: typeof import('vant')['NavBar']
    VanForm: typeof import('vant')['Form']
    VanPicker: typeof import('vant')['Picker']
    VanTabs: typeof import('vant')['Tabs']
    VanTab: typeof import('vant')['Tab']
    VanList: typeof import('vant')['List']
    VanPullRefresh: typeof import('vant')['PullRefresh']
    VanNoticeBar: typeof import('vant')['NoticeBar']
    VanCollapse: typeof import('vant')['Collapse']
    VanCollapseItem: typeof import('vant')['CollapseItem']
  }
}