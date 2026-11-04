# T04B 学徒篇剩余23题校准记录

日期：2026-11-04。初始内容基线：38d3b2409fa0bcfc446f4955a89b74ad5a6fe911。本批只修改学徒篇剩余23题，排除已完成的首批四题，不修改章节与注册表。

当前完成 23/23。校准指技术依据、证据关系、假设效应、停止点与评分审阅；不代替主实施流程的正式页面验收。

全部场景按真实技术机制进行教学重建，数值、业务公司与日志样本不冒充生产实测或原始工单。六维中位数半档向下取整，不因结业位置硬标L3；来源与正式内容修订号由主发布流程统一处理，本记录不自造contentRevision。

## 清单

| 章节 | ID | 原难度 | 当前难度 | 状态 |
|---|---|---:|---:|---|
| access | dns-hijack | 2 | 2 | calibrated |
| access | ssl-chain-missing | 2 | 2 | calibrated |
| access | cors-101 | 1 | 1 | calibrated |
| access | nginx-trap | 2 | 2 | calibrated |
| access | gateway-review | 2 | 2 | calibrated |
| access | ws-upgrade | 2 | 2 | calibrated |
| access | cert-sni | 2 | 2 | calibrated |
| access | canary-decision | 3 | 3 | calibrated |
| build | white-screen | 1 | 1 | calibrated |
| build | dep-hell | 1 | 1 | calibrated |
| build | ci-cache-pollution | 2 | 2 | calibrated |
| build | image-tag-drift | 2 | 2 | calibrated |
| build | buildtime-inject | 2 | 2 | calibrated |
| build | chunk-overlap | 2 | 2 | calibrated |
| build | pipeline-review | 2 | 2 | calibrated |
| error-reading | symptom-cluster | 2 | 2 | calibrated |
| error-reading | first-domino | 3 | 2 | calibrated |
| integration | field-mismatch | 1 | 1 | calibrated |
| integration | cookie-lost | 2 | 2 | calibrated |
| integration | waterfall-read | 2 | 2 | calibrated |
| integration | poll-storm | 2 | 2 | calibrated |
| integration | mock-canyon | 2 | 2 | calibrated |
| integration | tri-platform | 3 | 2 | calibrated |

## dns-hijack

训练目标：错误DNS答案与网络故障的变量隔离。

修正：

- 按解析器限定影响，删除全省全部失败及请求根本没出发的过断结论。
- DNS错误地址改证书主机名错误，不再伪造UnknownHost。
- 正确IP对照用--resolve保留SNI与证书校验并排除CDN/骨干。
- IP登记不证明广告劫持，TTL及HTTPDNS恢复不作保证。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. “地域×解析器”后核对权威并保留TLS直达，需两步归因。
2. “R答198.51.100.20”与权威记录、客户端连接交叉验证。
3. 需区分递归/权威、Host/SNI与地址。
4. “解析成功”仍可能连错，推翻DNS失败只等于UnknownHost。
5. 跨DNS、HTTPS与CDN路径。
6. “切换权威DNS”是显式危险动作，却不能修复递归端错误答案，符合L2危险陷阱。

路径与评分：

- 标准路径：a-impact → a-dnsquery → a-compare，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-compare → a-dnsquery，4⚡；使用真实computeGrade，零错误为S。

停止条件：已确认故障位于R的错误答案，可受控切换正常解析并向解析服务方提供证据；不把IP归属调查或TTL等待当作恢复保证。

终局确认：h-dns；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://datatracker.ietf.org/doc/html/rfc1034)。
- [官方资料2](https://curl.se/docs/manpage.html#--resolve)。

## ssl-chain-missing

训练目标：证书链缺失的验证方向、分布与触发闭环。

修正：

- 改为L4透传到Nginx终止TLS，修正客户端验证被写成服务端验证的方向错误。
- 有效期候选核对客户端时钟而非服务器NTP。
- 签发三天前与22:45部署分开，22:00gzip独立。
- 不泛化iOS/Android补链策略，加入真实库与干净状态单变量验证。
- 两条7成本路径完整排除6个候选中的错误项。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. “有效期/SAN正确”后以缺链及补链验证收敛。
2. 客户端alert、发布材料和干净库对照三种材料。
3. 区分验证方向与中间/根信任。
4. “成功样本有缓存”说明部分成功不证明完整链。
5. 跨客户端TLS、L4转发与Nginx部署。
6. “回滚22:00配置”“重启全部节点”均有代价却不补22:45缺链，属于L2危险动作陷阱。

路径与评分：

- 标准路径：a-impact → a-errorlog → a-expiry → a-chain → a-lib，7⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-errorlog → a-impact → a-chain → a-expiry → a-lib，7⚡；使用真实computeGrade，零错误为S。

停止条件：停止诊断；部署CA提供的叶子+中间证书，校验顺序并reload，以无中间缓存的真实库A重试；不关闭证书校验，不向客户端硬塞叶子为受信根。

终局确认：h-chain；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://nginx.org/en/docs/http/configuring_https_servers.html)。
- [官方资料2](https://docs.openssl.org/3.0/man1/openssl-s_client/)。

## cors-101

训练目标：简单跨源GET的响应授权而非虚构预检。

修正：

- 选择简单无凭证GET一致场景，删除GET200却用失败预检实锤的冲突。
- 保留a-options稳定ID但动作改核对实际GET与来源表。
- 实际状态/业务体排除401与500，来源配置单改验证CORS。
- 专家路径实购1+1+2=4，不机械保留原标5。

六维：1/1/1/1/2/1，L1。逐维原文依据：

1. “普通GET已发出”到“缺ACAO”直接对应。
2. 请求方法与响应头均直接可见。
3. 只需同源与CORS基本规则。
4. 200不等于JS可读是入门反直觉。
5. 浏览器与网关两层对照。
6. 无需隐藏状态或主动陷阱。

路径与评分：

- 标准路径：a-impact → a-console → a-options，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-options → a-console，4⚡；使用真实computeGrade，零错误为S。

停止条件：停止；按开发来源精确授权并复验实际GET。其他使用非简单头/方法的接口另验OPTIONS，不能把本题结论扩成所有跨源请求均先预检。

终局确认：h-cors；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。

## nginx-trap

训练目标：完整body边界、拒绝层与已加载配置核验。

修正：

- 按完整body而非文件大小量1048576阈值，补multipart开销。
- 不再仅凭Server头和无trace-id断言拦截层。
- nginx -T与成功reload归档/哈希对齐，不冒称内存生效配置。
- 标准6成本仍含四份不同必要证据，终局错误候选均排除。
- 按20MiB业务上限验上下界，不声称所有大文件全成功。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 分桶到逐层关联再到默认值/环境差异。
2. 请求ID、upstream标记与配置归档交叉。
3. 掌握指令继承、默认字节与加载时点。
4. “nginx -T”不等于运行内存，“图片”不等于body。
5. 跨客户端/CDN/WAF/Nginx与应用。
6. “扩容应用”不改变接入层拒绝点，状态变更与明确大小阈值相冲突，危险修配置前需定位。

路径与评分：

- 标准路径：a-impact → a-sizecorr → a-nginxconf → a-confdiff，6⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-nginxconf → a-sizecorr → a-confdiff，6⚡；使用真实computeGrade，零错误为S。

停止条件：完整请求体阈值、拒绝层、已加载配置与环境差异均闭合。停止诊断，按业务上限修复并验上下边界，不无条件取消限额。

终局确认：h-size；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)。
- [官方资料2](https://nginx.org/en/docs/switches.html)。

## gateway-review

训练目标：四个独立契约的完整网关评审结论。

修正：

- 全局10000与每IP20分开，不混总量与分组上限。
- 补路由比例和调用次数，8000×40%=3200超过库存2000才证明风险。
- 不把真实风险列成错误答案，改一个完整结论与三个不充分结论。
- 内网令牌加密按已定组织规则审阅，不凭roadmap默许。
- 五证据动作1+2+2+1+1=7，清单动作不赠确认。

六维：2/2/2/2/3/3，L2。逐维原文依据：

1. 四项分别核验后形成一个完整放行条件。
2. 8000×40%、命中日志、续期演练与数据流交叉。
3. 限流维度、容量模型、证书与信任域均为工程概念。
4. “总量未超”仍可过载，“隔离”不等于令牌可明文。
5. “路由容量、用户公平性、证书监控、令牌信任域”跨服务及组织规则边界，符合跨系统/职能L3。
6. “只改IP即可”“只补证书监控即可”均含真风险却给不充分放行结论，是看似正确的L3陷阱。

路径与评分：

- 标准路径：a-impact → a-capacity → a-ipdim → a-certmon → a-tls，7⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-certmon → a-tls → a-ipdim → a-capacity，7⚡；使用真实computeGrade，零错误为S。

停止条件：停止补材料，输出四项验收后再放行的完整评审结论；写下清单不等于完成实施，阈值也必须由实际容量与突发模型确定。

终局确认：h-limit；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)。
- [官方资料2](https://letsencrypt.org/docs/integration-guide/)。
- [官方资料3](https://csrc.nist.gov/pubs/sp/800/207/final)。

## ws-upgrade

训练目标：固定版本下逐跳升级头的单根因校准。

修正：

- 固定Nginx1.24.0且显式1.1，删除实际1.0也为错选的双真因。
- 补版本边界，官方1.29.7以后默认变化不写成通则。
- Origin用值/允许表/单变量实验证明，不把校验未到当无问题。
- 区分101前400与长连读取间隔超时。
- 标准1+2+1=4，移除重复及未购买证据的专家叙述。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 分群后出站核对再只补头验证。
2. 出站协议/头与同构对照相互支持。
3. 需要HTTP/1.1逐跳头及Nginx继承概念。
4. “传入有头”不保证出站有头。
5. 客户端/反代/后端三层。
6. “回滚网关配置”恢复握手但连带回退其他配置，是明确L2危险动作陷阱。

路径与评分：

- 标准路径：a-impact → a-nginxdump → a-repro，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-repro → a-nginxdump，4⚡；使用真实computeGrade，零错误为S。

停止条件：握手层因果已闭合，停止诊断并精确补头；修后另验双向消息与空闲心跳，101不等于连接永不掉线。

终局确认：h-upgrade；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://nginx.org/en/docs/http/websocket.html)。
- [官方资料2](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_http_version)。

## cert-sni

训练目标：SNI选证与链/名称校验分离及完整兼容修复。

修正：

- 删除2018分水岭、Java7全无SNI与全网解析一致等过断断言。
- 修正无效-nosni为-noservername，保留目标主机名与受信根验证。
- 标准三动作4成本，实际覆盖链/边缘/解析三错误候选。
- 不按多数流量换默认证书冒充全修，改独立兼容入口并验旧新站。
- 失败在HTTP前不依赖UA，也不自动从缺SNI判定全部根因。

六维：2/2/2/2/2/3，L2。逐维原文依据：

1. 路径排除后读字段，再仅改SNI。
2. ClientHello、已加载站点配置和验证输出交叉。
3. 需区分SNI、Host与证书链/名称校验。
4. “链可验证”不代表主机名匹配。
5. 跨DNS/TLS/虚拟站点与兼容客户端。
6. “换默认证书后新站恢复”看似正确，却使同IP旧站无SNI用户失败，是L3恢复引发旁路损害陷阱。

路径与评分：

- 标准路径：a-impact → a-clientprobe → a-repro，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-repro → a-clientprobe，4⚡；使用真实computeGrade，零错误为S。

停止条件：已定位SNI缺失与默认站点名称不匹配，停止诊断。为新域名提供独立兼容入口或完整覆盖所需名称的证书方案，分别验旧/新站，不按多数比例直接搬走故障。

终局确认：h-sni；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://nginx.org/en/docs/http/configuring_https_servers.html)。
- [官方资料2](https://docs.openssl.org/3.0/man1/openssl-s_client/)。
- [官方资料3](https://letsencrypt.org/docs/integration-guide/)。

## canary-decision

训练目标：保留统计不确定性并按预定风险边界决策。

修正：

- 移除样本×4等于置信度×4、24h必识别原因、老用户排冷启动、趋势必然扩大的错误。
- 补独立用户分母460/5000与9500/95000，给可复核探索区间。
- 明确D0固定5%至D7与未触护栏，正确决策为不扩量，终局不达标/不确定回退。
- 候选改为完整行动与有错误理由的三项，不把合理保守回退一概当错。
- 实际五必要动作5成本；六维2/3/3/2/3/3中位数3，量化证据/统计机制/职能跨度/看似正确陷阱支持保留章尾唯一L3。

六维：2/3/3/2/3/3，L3。逐维原文依据：

1. 核对样本/机制/故障后与D0规则合并决策。
2. “区间跨零也包含损失”需要组合不确定证据，不直接给根因。
3. 二项比例标准误、百分点/相对差与非劣性边界。
4. 不显著不等于安全，可回退也不等于已发生损失可逆。
5. “分组/指标有效性、推荐机制、D0授权和商业损失预算”跨算法与产品发布职能边界，符合L3。
6. “扩大样本提高信息量”本身合理，却被误用为越过已定风险边界的扩量理由，是L3看似正确陷阱。

路径与评分：

- 标准路径：a-impact → a-sample → a-cold → a-bug → a-trend，5⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-bug → a-cold → a-sample → a-trend，5⚡；使用真实computeGrade，零错误为S。

停止条件：停止当前决策循环，维持已批准5%而不扩量；技术/商业护栏持续生效，D7按预定方法验收，未达标准或仍不确定即回退。没有承诺自动恢复或下次一定能识别机制。

终局确认：h-real；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://www.itl.nist.gov/div898/handbook/prc/section3/prc33.htm)。
- [官方资料2](https://sre.google/workbook/canarying-releases/)。

## white-screen

训练目标：区分模块加载与运行时错误，核对制品和响应。

修正：

- 移除404脚本必被当HTML执行的矛盾。
- CDN没有缓存旧资源清单这一无依据机制被删除。
- 区分完整构建正常和发布漏传。
- 修正接口未发起却全部200的叙述。

六维：1/1/1/1/2/2，L1。逐维原文依据：

1. a-resources直接显示缺JS与HTML响应。
2. 状态/MIME/字节直接记录。
3. 模块加载基础规则。
4. 结论与响应类型一致。
5. 构建、发布与浏览器两边。
6. “回滚上一版本”是明确有状态代价的动作，按危险动作维度应为L2；其余四维直陈仍为整体L1。

路径与评分：

- 标准路径：a-impact → a-console → a-resources，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-resources → a-console，4⚡；使用真实computeGrade，零错误为S。

停止条件：新入口缺文件、源站200HTML回退及模块MIME拒绝共同闭合。

终局确认：h-res；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script)。
- [官方资料2](https://vite.dev/guide/build)。
- [官方资料3](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。

## dep-hell

训练目标：用公开API和实际依赖图验证安装漂移。

修正：

- 移除不存在的Day.js1.12 API删除叙述。
- 采用有公开依据的Lodash3pluck与4map。
- 不把minor升级移除API作为正常semver规则。
- 区分代码不同与依赖契约不适配，给出单变量对照。

六维：1/2/2/1/1/1，L1。逐维原文依据：

1. pluck与实际major差异直给。
2. 同源码只换图的对照。
3. “*允许跨major、锁与实际依赖图”属于领域安装机制L2，证据仍直接指向缺锁和API变更。
4. 结论与版本变化一致。
5. 同一前端构建层。
6. 无L2危险要求。

路径与评分：

- 标准路径：a-impact → a-coderead → a-diff → a-lockfile，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-diff → a-lockfile → a-coderead，4⚡；使用真实computeGrade，零错误为S。

停止条件：同文件、同环境、不同依赖图与锁状态及单变量对照闭合。

终局确认：h-lock；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://lodash.com/docs/3.10.1#pluck)。
- [官方资料2](https://lodash.com/docs/4.17.21#map)。
- [官方资料3](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#dependencies)。
- [官方资料4](https://docs.npmjs.com/cli/v10/commands/npm-ci)。

## ci-cache-pollution

训练目标：区分CI通过与关键用例真实执行。

修正：

- 修复生产包含calcDiscount却报该函数不存在的自相矛盾。
- 补齐恢复后跳npm ci与用例skip机制。
- 固定key不再被说成永不失效。
- 标准4，避免把修复后的未来结果当停止前已知。

六维：2/2/2/3/2/3，L2。逐维原文依据：

1. 缓存顺序与skip机制组合。
2. 只改安装步骤的对照。
3. 锁、缓存与测试执行语义。
4. “CI全绿”实际是关键断言被skip，直觉中的质量证据反向失效，符合L3。
5. CI依赖与生产制品。
6. “恢复node_modules缓存且存在就不安装”看似加速成功却绕过依赖一致性和断言，是L3主动陷阱。

路径与评分：

- 标准路径：a-impact → a-depdiff → a-cacheconf，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cacheconf → a-depdiff，4⚡；使用真实computeGrade，零错误为S。

停止条件：关键用例状态、依赖图及恢复后跳安装的执行顺序与对照闭合。

终局确认：h-cache；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.npmjs.com/cli/v10/commands/npm-ci)。
- [官方资料2](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md)。

## image-tag-drift

训练目标：用对象身份与Pod启动记录核实镜像漂移。

修正：

- 修正latest默认策略与建集群默认的错误。
- 补齐真实Pod重建触发。
- 删除IfNotPresent永不更新、Always零成本等绝对叙述。
- 同类普查移出标准定位成本。

六维：2/2/2/2/2/3，L2。逐维原文依据：

1. 实际对象、模板与缓存事件组合。
2. 同平台digest与制品对照。
3. Kubernetes拉取及滚动机制。
4. 部署成功不代表修复已到达。
5. CI、仓库与节点。
6. “删Pod重建就会拿最新”看似正确，却在显式IfNotPresent和旧节点缓存下重现故障，符合L3。

路径与评分：

- 标准路径：a-impact → a-pullpolicy → a-imageinspect，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-imageinspect → a-pullpolicy，4⚡；使用真实computeGrade，零错误为S。

停止条件：同平台镜像身份、显式策略与启动事件、制品内容对应。

终局确认：h-taglatest；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://kubernetes.io/docs/concepts/containers/images/)。

## buildtime-inject

训练目标：从实际读者定位构建变量与运行时配置断点。

修正：

- 不再声称本地永远无法复现。
- 从代码读者与实际URL排除错误层。
- 运行时注入不被说成必须或自动即时生效。
- 最短修复为补齐构建输入重新发布。

六维：2/2/2/2/2/3，L2。逐维原文依据：

1. 读者、构建输入和包身份组合。
2. 开发配置与本次构建对照。
3. 构建静态替换。
4. 配置改了但无运行时读者。
5. “CI构建时变量”与“浏览器已发布产物”跨构建/运行两跳，为L2。
6. “回滚入口后覆盖同hash JS”看似修URL却破坏不可变内容契约，属于L3陷阱。

路径与评分：

- 标准路径：a-impact → a-bundlecheck → a-cdncheck，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cdncheck → a-bundlecheck，4⚡；使用真实computeGrade，零错误为S。

停止条件：构建输入、实际读取阶段与分发身份一致指向旧默认值内联。

终局确认：h-inline；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vite.dev/guide/env-and-mode)。

## chunk-overlap

训练目标：区分发布空窗与持续断引用并验证精确URL。

修正：

- 删除旧hash不会在新包解压完成后自动恢复。
- 保留旧目录与旧URL可访问分别说明。
- 不把ln -sfn或24h一律当充分方案。
- 标准5由四项必要证据组成，非机械保留旧基准4。

六维：2/2/2/2/2/3，L2。逐维原文依据：

1. 删除与新旧引用联合推断。
2. 发布中/结束后的同URL对照。
3. hash、路由与原子替换机制。
4. 发布结束旧页仍失败。
5. 部署到旧浏览器请求。
6. “发布期间维护页”看似隔离流量，却仍挡不住已打开SPA请求旧chunk，是L3看似正确陷阱。

路径与评分：

- 标准路径：a-impact → a-deploylog → a-assetname → a-edgecheck，5⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-edgecheck → a-deploylog → a-assetname，5⚡；使用真实computeGrade，零错误为S。

停止条件：具体旧URL、删除记录与同URL保留对照支持持续断引用。

终局确认：h-window；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vite.dev/guide/build)。
- [官方资料2](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。
- [官方资料3](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)。

## pipeline-review

训练目标：区分评审的独立缺口与已治理条件。

修正：

- 把真实缓存风险从错误根因改为完整正确决策的一部分。
- 不将所有自动合并或并行化笼统定罪。
- 自建跨项目缓存与GitHub默认作用域分清。
- 补齐并行和指纹核对，标准7与完整评审所需证据一致。

六维：2/2/2/2/3/3，L2。逐维原文依据：

1. 审批、缓存与隔离多项材料对照。
2. 方案与实际job记录。
3. 来源、hash与权限机制。
4. 功能绿不证明依赖可信。
5. “依赖审批、跨项目可写缓存、worker隔离”跨供应链与发布组织边界，符合L3。
6. “功能测试全绿即可自动发布”看似质量充分，却不满足已定来源与审批契约，属于L3陷阱。

路径与评分：

- 标准路径：a-supply → a-botpath → a-cache → a-parallel → a-keyfix，7⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-supply → a-cache → a-botpath → a-keyfix → a-parallel，7⚡；使用真实computeGrade，零错误为S。

停止条件：既定审批、实际缓存权限、并行隔离与保留指纹全部核对后给完整有条件结论。

终局确认：h-bot；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions)。
- [官方资料2](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)。
- [官方资料3](https://slsa.dev/spec/v1.0/requirements)。

## symptom-cluster

训练目标：用共享输入与对照验证多症状归一。

修正：

- 移除无依据的十亿分之一概率。
- 修复布尔键被当整数解析的语义。
- 去掉返回后的配置函数仍必在栈底、三个不同jar哈希应相同等错误。
- 标准链保留对照动作，不把防线计划当定位证据。

六维：2/2/2/2/3/2，L2。逐维原文依据：

1. 需将共享键与三种消费路径对照，a-originstamp。
2. 相同输入与只补键的对照，a-cointoss。
3. null解引用、整数解析与配置契约。
4. 同秒只作线索，需撤键复现。
5. “会员、积分、营销”不同服务共同读取配置，跨服务关联为L3。
6. “紧急重启三模块”有明确状态代价且不能生成缺失配置键，属于L2危险陷阱。

路径与评分：

- 标准路径：a-impact → a-originstamp → a-cointoss，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cointoss → a-originstamp，4⚡；使用真实computeGrade，零错误为S。

停止条件：同一缺失值、三条代码路径、只补该键的对照闭合。

终局确认：h-onecause；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Integer.html#parseInt(java.lang.String))。
- [官方资料2](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Throwable.html#getStackTrace())。

## first-domino

训练目标：用事前事件和请求传播恢复错误风暴。

修正：

- 改正SQL执行超时与借连接超时混称。
- 补齐错误与调用传播方向。
- 移除抽查100条证明全量的结论。
- 六维中位数为2，不因结业皮肤维持L3。

六维：2/2/2/2/3/3，L2。逐维原文依据：

1. 需回查超时前30秒等待及SQL变更。
2. 分阶段与全量trace/retryOf对照。
3. 连接等待、查询计划与重试机制。
4. 第一条异常不等于首因。
5. “订单借连接→catch空指针→调用方重试→库存/优惠券”跨服务链为L3。
6. “重启并扩容订单”看似增加处理能力，反而增加DB借用压力，属于L3恢复动作反噬陷阱。

路径与评分：

- 标准路径：a-impact → a-firsterror → a-independence，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-independence → a-firsterror，4⚡；使用真实computeGrade，零错误为S。

停止条件：先行变更、资源占用、同请求传播和受控回放支持共同触发，独立磁盘告警另行核查。

终局确认：h-firstdomino；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-5.1.0/src/main/java/com/zaxxer/hikari/pool/HikariPool.java)。
- [官方资料2](https://dev.mysql.com/doc/refman/8.0/en/explain.html)。

## field-mismatch

训练目标：解释成功响应为何被前端过滤为空。

修正：

- 补齐真正隐藏行的过滤条件，读错字段不再被说成必然空表。
- 分开网络真实响应与消费代码两份必要证据，标准4。
- 允许先读代码再核对响应，两种顺序都在证据齐全后停止。

六维：1/1/1/1/2/1，L1。逐维原文依据：

1. a-netpanel「12行的user_id全为undefined」直给。
2. 响应与过滤代码同屏。
3. undefined与filter是基础语义。
4. 症状与常见字段错位一致。
5. 接口与页面两个消费边界。
6. 无危险陷阱。

路径与评分：

- 标准路径：a-impact → a-netpanel → a-responsebody，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-responsebody → a-netpanel，4⚡；使用真实computeGrade，零错误为S。

停止条件：非空响应、业务分支与错误字段过滤解释全部症状。

终局确认：h-field；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_accessors)。

## cookie-lost

训练目标：区分跨源凭证模式、同站属性和CORS。

修正：

- 由三种缺陷同时confirmed改成单一根因。
- 明确HTTPS同站跨源，移除跨源必None与Secure等绝对结论。
- 完整头与七天有效期一致。
- 标准4且核对独立条件。

六维：2/2/2/2/2/3，L2。逐维原文依据：

1. 代码与只改include的对照。
2. 完整头、存储面板与站点关系对比。
3. same-origin/include与SameSite机制。
4. Set-Cookie可见不等于保存。
5. 浏览器请求与API响应边界。
6. “回退为同源代理”可以使登录恢复，却不再验证所需跨源条件，是L3看似通过但验收对象改变。

路径与评分：

- 标准路径：a-impact → a-cookiedetail → a-fetchcode，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-fetchcode → a-cookiedetail，4⚡；使用真实computeGrade，零错误为S。

停止条件：默认凭证模式与只改include的对照成立，其他条件逐项排除。

终局确认：h-credentials；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。
- [官方资料3](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。

## waterfall-read

训练目标：分清代理、连接、TTFB与服务端处理时间。

修正：

- 移除3次握手等于3RTT的算术。
- 不再无证据假定浏览器逐级在线OCSP。
- 改用明确代理协商记录，分段总和3秒。
- 说明TTFB不等于后端日志耗时。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. Timing与独立代理记录组合。
2. 同条件仅恢复lookup的对照。
3. 代理、TCP/TLS与TTFB边界。
4. 后端120ms与客户端3秒并不冲突。
5. 浏览器、代理与服务端两跳。
6. “回滚邻近证书变更”是明确危险动作，不能修CONNECT代理目录等待，为L2。

路径与评分：

- 标准路径：a-impact → a-waterfall → a-repro，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-repro → a-waterfall，4⚡；使用真实computeGrade，零错误为S。

停止条件：Timing、CONNECT目录等待和单变量对照相互印证。

终局确认：h-connect；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.chrome.com/docs/devtools/network/reference/#timing-explanation)。
- [官方资料2](https://www.rfc-editor.org/rfc/rfc9110.html#name-connect)。

## poll-storm

训练目标：按调度器生命周期与正确单位核算前端负载。

修正：

- 纠正每分钟误记QPS的60倍错误。
- 负载640确实超过同条件500，清理后46。
- 删掉后台一律一分钟与ETag减少请求数/容量必增十倍。
- 区分主因与背景，不将真实放大器强标错误根因。

六维：2/3/2/2/2/3，L2。逐维原文依据：

1. 定时器计数与负载复测组合。
2. “30页×100个÷5秒=600QPS，加40超过500；清理后46”需量化对账，符合L3证据形态。
3. interval清理和排队容量。
4. 人不操作不代表页面停止。
5. 浏览器、网关与后端。
6. “回滚前端”看似恢复旧逻辑，却不清理已打开SPA的timer，属于L3看似正确陷阱。

路径与评分：

- 标准路径：a-impact → a-timeraudit → a-backendlog，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-backendlog → a-timeraudit，4⚡；使用真实computeGrade，零错误为S。

停止条件：定时器数量、640/46QPS算术及容量复测闭合。

终局确认：h-timer；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vuejs.org/api/composition-api-lifecycle#onunmounted)。
- [官方资料2](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)。
- [官方资料3](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)。

## mock-canyon

训练目标：核实验证对象、单位换算与真实协议。

修正：

- 修正880/8.80/0.088换算方向。
- 不虚构真实供应商v2换单位。
- 47%明确为路径占比。
- 沙箱同provider同SDK，mock仅隔离单测。
- 移除过期自动摘mock连生产的隐患。

六维：2/2/2/2/3/3，L2。逐维原文依据：

1. 原始输入与÷100代码对账。
2. mock/真实同金额输入对照。
3. 协议、签名、幂等职责。
4. 联调全绿反而隐藏适配器错。
5. “客户端金额适配、网关协议、回调/入账”跨支付系统边界，为L3。
6. “回滚旧mock后全绿”仅恢复错误参照，不证明真实provider协议，为L3错误验收陷阱。

路径与评分：

- 标准路径：a-impact → a-mockcheck → a-gatewaychangelog，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-gatewaychangelog → a-mockcheck，4⚡；使用真实computeGrade，零错误为S。

停止条件：输入换算、稳定协议与真实SDK沙箱样本对应，签名和结算次数无异常。

终局确认：h-mock；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://martinfowler.com/articles/mocksArentStubs.html)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Division)。

## tri-platform

训练目标：按客户端与规则对照验证共享发布影响。

修正：

- 改正部署22点与07点启用时刻矛盾。
- 移除无前提巧合概率。
- 握手前改成TLS协商阶段。
- 不把重新开放TLS1.0作为默认修复。
- 实际六维仅一项3、中位数2，降为L2。

六维：2/2/2/2/3/2，L2。逐维原文依据：

1. 规则与三种症状单跳对照。
2. 逐端只改一项的演练。
3. Referer/Origin/TLS领域机制。
4. 客户端未变也会暴露兼容缺口。
5. 三端与网关策略跨边界。
6. 整体回滚伴随明确安全取舍。

路径与评分：

- 标准路径：a-impact → a-policydiff → a-cointoss，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cointoss → a-policydiff，4⚡；使用真实computeGrade，零错误为S。

停止条件：同策略版本的规则命中与逐端单变量演练支持共享变更归因。

终局确认：h-policy；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。
- [官方资料2](https://www.rfc-editor.org/rfc/rfc8996.html)。
- [官方资料3](https://staticintl.cloudcachetci.com/doc/pdf/product/pdf/1219_57657_en.pdf)。

## 验证

`node --test content/baselines/t04b-apprentice-semantic.test.mjs`校验已完成题的哈希、目录保持、六维取整、双路径、假设终态、实际评级和已知关键事实。每批另跑案例validate、原T04A基线及目录检查，并用Python CasePayload和gate交叉验证；剩余pending题不计完成。

## 本批完成复核（2026-11-04）

- 23/23 均已完成编审；46条已记录路径用项目真实 `computeGrade` 计算均为S，终局只有记录中的正确假设确认，其余候选排除。
- 23题 `content/pipeline/validate.mjs` 全绿且零警告；23题以 `CasePayload` 和 `check_case` 交叉验证均返回无问题。
- T04B语义回归、原T04A语义回归、基线与目录测试共49项通过；本批23题独立TypeScript检查通过。
- 原首批四题与T04A基线未变，章节/注册表未改。正式UI、发布修订号与版本登记继续由主发布流程统一完成，本记录未把静态走验说成生产实测。
- 最后逐维复核按规范区分L2危险动作和L3看似正确陷阱，补齐跨服务/跨职能L3跨度依据。`first-domino`、`tri-platform`从L3降L2；`canary-decision`的2/3/3/2/3/3中位数为3，仍是学徒篇章尾唯一L3。没有为保留结业难度改变中位数规则。
- 尝试对旧版完整目录做独立TypeScript检查时，遇到本批以外的既有问题：`cache-review`缺少`excludeActionId`、`false-lead`重复字面量键，以及未提供uni-app运行环境声明。没有越界修改这些文件；主工程的完整平台构建由集成线程处理。
