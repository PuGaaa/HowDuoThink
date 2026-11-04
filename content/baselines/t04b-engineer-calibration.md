# T04B 工兵篇逐题校准记录

范围为当前清单29题；不调整章节顺序、免费体验序列或发布修订号。原始版本98cc581。以下案例均为技术机制教学重建，日志与数值为教学样本，不是实际事故原始记录或生产性能实测。技术来源仅支持机制，不为虚构情境背书。

难度维度顺序：推理距离 / 证据形态 / 知识层次 / 反直觉度 / 跨层跨度 / 陷阱主动性；取中位数，半档向下。成本按定位必要证据人工裁定，修复与全仓制度审计不冒充已执行取证。两路径均逐动作运行真实computeGrade与假设终态规则。

## config-typo（config-boot/1）

学习目标：配置键对不上时，框架静默用默认值——生效断言要成为配置的习惯。

编审：保留4⚡：逐字对照2⚡+来源快照1⚡是必要证据，修复不计定位成本。去除题面答案及错误的默认未知键告警承诺。

难度：L1→L1；六维[1, 1, 1, 1, 1, 1]。

1. 30s症状→精确键对照
2. 完整两行键名
3. 显式占位符默认值
4. 默认值与30s直接吻合
5. 同一应用配置绑定
6. 无危险试错动作

标准路径：a-impact → a-keydiff → a-loadcheck，4⚡，零错S；终态确认h-typo，其余全部excluded。

替代路径：a-impact → a-loadcheck → a-keydiff，4⚡，零错S；终态确认h-typo，其余全部excluded。

停止点：【停止规则】精确键不匹配和默认值路径已确认，加载、覆盖、profile均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-order（config-boot/2）

学习目标：启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级。

编审：保留4⚡，修正MQ依赖因果、三条WARN及缓存污染自相矛盾；区分核心监听与可降级预热。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 功能分组→初始化分支
2. 日志与代码交叉
3. 就绪契约与初始化
4. 端口正常而功能缺失
5. 业务组件与DB时间窗
6. 重启恢复掩盖无重试

标准路径：a-impact → a-bootlog → a-poolcheck，4⚡，零错S；终态确认h-swallow，其余全部excluded。

替代路径：a-impact → a-poolcheck → a-bootlog，4⚡，零错S；终态确认h-swallow，其余全部excluded。

停止点：【停止规则】启动失败被忽略且无重试已确认，缓存占位、池等待和旧地址均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## hot-reload-gap（config-boot/3）

学习目标：推送解决"送达"，不解决"生效"——热更新需要刷新语义。

编审：保留4⚡；以使用点核对替代非必要全仓审计，修复字段注解错误及自动刷新过度概括。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 送达→绑定→读取
2. 运行值+代码+对照
3. 单例与刷新作用域
4. ACK成功仍旧值
5. 配置监听与业务字段
6. 重启可暂时掩盖

标准路径：a-impact → a-injectmode → a-usageaudit2，4⚡，零错S；终态确认h-frozen，其余全部excluded。

替代路径：a-impact → a-usageaudit2 → a-injectmode，4⚡，零错S；终态确认h-frozen，其余全部excluded。

停止点：【停止规则】Environment与字段差异及刷新对照已确认，键错、二次缓存和业务缓存均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)、[官方资料2](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html)。

## priority-clash（config-boot/4）

学习目标：同一键多个来源时，优先级链决定最终事实——同键多源就是治理工单。

编审：保留4⚡，纠正环境变量映射、固定Nacos优先级和双confirmed；全仓审计移出必要定位路径。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 面板→来源→运行
2. 有序来源与启动记录
3. 绑定与优先级
4. 送达成功但未采纳
5. 部署环境到应用池
6. 再改高优先级来源掩盖治理

标准路径：a-impact → a-sourcecheck → a-runtimecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

替代路径：a-impact → a-runtimecheck → a-sourcecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

停止点：【停止规则】实际来源覆盖已确认，键错、随机顺序及未重启均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## profile-maze（config-boot/5）

学习目标：profile 分层合并的隐形差异——环境专属键必须显式盘点。

编审：保留4⚡；把注入/版本反证真正写入被执行动作，区分包内文件与部署外置文件。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 同输入→最终值→origin
2. diff与单变量复验
3. profile合并与外置配置
4. 镜像同而行为不同
5. 部署目录到应用输出
6. 文件级回滚破坏其他合法项

标准路径：a-impact → a-profilediff → a-artifactcompare，4⚡，零错S；终态确认h-profile，其余全部excluded。

替代路径：a-impact → a-artifactcompare → a-profilediff，4⚡，零错S；终态确认h-profile，其余全部excluded。

停止点：【停止规则】外置profile差异及输出对照已确认，产物、版本、注入均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-storm（config-boot/6）

学习目标：恢复期的惊群要有刹车——分批、爬坡、抽样预热。

编审：人工裁定必要成本6⚡（原4遗漏DB状态与探活反证），不因章尾保留L3；六维中位数2.5向下为L2。重写不可能的980/800与混合单位算式。

难度：L3→L2；六维[2, 3, 2, 3, 2, 3]。

1. 区分首场与恢复事件
2. 多曲线与单位核算
3. 连接和预热容量
4. 恢复反而过载
5. 应用启动到DB资源
6. 无退避重启再次触发

标准路径：a-impact → a-stormcurves → a-dbhealth → a-poolcfg → a-probestorm，6⚡，零错S；终态确认h-storm，其余全部excluded。

替代路径：a-impact → a-dbhealth → a-poolcfg → a-probestorm → a-stormcurves，6⚡，零错S；终态确认h-storm，其余全部excluded。

停止点：【停止规则】恢复风暴有时间线和同构对照，残留慢查询、稳态超配和探活主因均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/too-many-connections.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/innodb-preload-buffer-pool.html)。

