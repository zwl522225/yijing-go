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

## 2026-10-20 补充调研

成组练习沿用本项目题目与规则引擎，参考以下资料的组织方式，自行实现短练习和本轮小结，没有迁入第三方代码、题库、字体、图标或模型：

- [KaTrain](https://github.com/sanderland/katrain/tree/f4981cf905cece90085ce4e3967415d0c16d525f)：参考即时反馈与重试。实际 [LICENSE](https://github.com/sanderland/katrain/blob/f4981cf905cece90085ce4e3967415d0c16d525f/LICENSE) 另列资源许可，不能将整个仓库统一标成 MIT；本游戏没有对应的 KataGo 点损分析。
- [Ten Thousand Tsumego](https://github.com/sanderland/tsumego/tree/9d2ca58d3188f42a4bb1248d6c2c1ebbaca56ce4)：参考按类别和题集组织。它采用先阅读、不落子的训练方式；本游戏保留可操作棋盘，其 [MIT 式许可文本](https://github.com/sanderland/tsumego/blob/9d2ca58d3188f42a4bb1248d6c2c1ebbaca56ce4/LICENSE) 不代表本轮核验了题库逐项权属。
- [围棋练习盘 Weiqi Dojo](https://github.com/wang90/weiqi-dojo/tree/25cdd065bb5e68d891e7ded7cdb9136f9fa03faa)：参考中文练习的完成反馈和重新开始，[MIT](https://github.com/wang90/weiqi-dojo/blob/25cdd065bb5e68d891e7ded7cdb9136f9fa03faa/LICENSE)。本游戏的五题分组、小结口径与需巩固再练是结合自身流程的设计，不声称这些项目均有相同功能。

也查阅了未声明仓库许可证的 [go-coach](https://github.com/geekhuashan/go-coach/tree/53fb51be88b76141ffda29b199c1d06aa59c9060) 和 [Gitee KataGo 镜像](https://gitee.com/amiok926/KataGo)，未复用其代码或数据。未来接入须核对实际原作者版本、内容来源与许可。

## 连续吃子练习参考

连续练习继续参考 [Weiqi Dojo](https://github.com/wang90/weiqi-dojo/tree/25cdd065bb5e68d891e7ded7cdb9136f9fa03faa) 的交互练习与重练组织、[KaTrain](https://github.com/sanderland/katrain/tree/f4981cf905cece90085ce4e3967415d0c16d525f) 的反馈与重试思路，以及 [Ten Thousand Tsumego](https://github.com/sanderland/tsumego/tree/9d2ca58d3188f42a4bb1248d6c2c1ebbaca56ce4) 的分类组织。结合本项目课程，自行实现“黑棋落子—手动查看白棋示范应手—黑棋再落子”的有限路线；不将这些参考视为本游戏具备最强应手、自由求解或引擎分析能力的证明。

枷吃与倒扑题形来自本项目现有 `STAGE_2_SHAPES.net` 和 `STAGE_2_SHAPES.snapback`，逐手使用自有规则引擎核对棋块、气数和提子。枷吃仅提供向右、向下两个示范分支，倒扑仅提供先失一子、再反提三子的示范路线。本轮没有复制外部代码、题库、音乐或美术，也没有新增运行时依赖；第三方许可边界沿用上述固定版本核对记录。

## 2026-10-20 至 21 日 SGF 补充核对

整盘棋谱导出依据以下原始资料，自行实现历史校验与 SGF 编码，没有迁入外部应用代码、题库或素材：

- [SGF FF4 规范](https://www.red-bean.com/sgf/sgf4.html)：棋谱树、属性值、字符集和文本转义。本游戏导出 UTF-8 单主线。
- [围棋坐标与停手](https://www.red-bean.com/sgf/go.html)：坐标先列后行、从左上角开始，空值表示停手。
- [SGF FF4 属性表](https://www.red-bean.com/sgf/properties.html)：棋盘大小、初始摆子与执子方、贴目、规则名、结果和叉号标记。已确认死子使用标记，保留真实落子后的棋盘，不以删子改写主线。
- [Sabaki 官方仓库](https://github.com/SabakiHQ/Sabaki)：作为外部 SGF 棋谱编辑器的使用参考；本游戏没有集成 Sabaki，也未增加棋谱导入、变化树或 AI 分析。

导出前由本项目规则引擎验证完整历史；SGF 格式本身不证明落子合法或死活判断正确。文件中的结果来自本游戏最终确认，外部工具重新计分可能采用不同死子处理，不能将棋谱视为赛事裁决证明。
