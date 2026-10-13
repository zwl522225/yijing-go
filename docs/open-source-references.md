# 开源设计参考

2026-10-09 调研官方仓库，当前只借鉴交互与教学组织，未引入其代码或题库。

| 项目 | 参考内容 | 当次核对的许可 |
| --- | --- | --- |
| [Sabaki](https://github.com/SabakiHQ/Sabaki) | 逐手复盘与注解 | MIT |
| [Shudan](https://github.com/SabakiHQ/Shudan) | 坐标、标记、动画和缩放 | MIT |
| [Tenuki](https://github.com/aprescott/tenuki) | 触屏适配、规则与渲染分离 | MIT，API 标记 beta |
| [KaTrain](https://github.com/sanderland/katrain) | 教学陪练、错误反馈和重试 | 主体 MIT，资源另有条款 |
| [frank_go](https://github.com/akitaonrails/frank_go) | 主题练习、进度与简化面板 | 代码 MIT，题库另有来源 |
| [OGS 客户端](https://github.com/online-go/online-go.com) | 网页对局和题目模式组织 | AGPL-3.0 |
| [OGS Goban](https://github.com/online-go/goban) | 独立棋盘库 | Apache-2.0 |
| [KataGo](https://github.com/lightvector/KataGo) | 未来可选分析后端 | 主体 MIT，依赖另有许可 |

弈境保留自有水墨风格、课程、术语和规则引擎。重点让任务可见、错误解释与局面一致、手机落子准确，并形成学习、练习、实战和复习的闭环。

正式复用时核查固定版本的实际许可，尤其是 [KaTrain LICENSE](https://github.com/sanderland/katrain/blob/main/LICENSE) 和 [frank_go 数据来源](https://github.com/akitaonrails/frank_go/blob/master/data/SOURCES.md)。代码许可不自动覆盖题库或素材。

KataGo 尚未接入。[分析协议](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md)用于后续原型研究，费用和延迟需要实际测量。
