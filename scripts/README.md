### rename.js
将节点进行重命名的脚本
### sing-box-col.js
把节点装进 sing-box 配置模板的 outbounds，按机场和地区生成策略组。
单订阅和组合订阅都支持，组合订阅需要加 `type=col` 参数。默认不生成节点级策略组；需要
配合 sing-box-smart 面板时，加 `smart=on`，生成 `<机场> SMART` 组。
ECH 兼容场景可加 `strip-ech=on`，删除节点的 `tls.ech`。
### node_info.js
把订阅的流量、到期信息做成一个节点插在最前面
