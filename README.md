# QFiler

File Query Language — 按文件头、内容、后缀等条件搜索文件的 VS Code 插件。

## 用法

| 命令 | 调用方式 |
|------|---------|
| `QFiler: 搜索文件` | `Ctrl+Shift+P` 输入 |
| `QFiler: 从此目录搜索` | 右键文件夹 |

## 查询语法

```
. [ex:sio]             后缀
. [nhd:mai]            文件名开头
. [ned:.bin]           文件名结尾
. [nin:boot]           文件名包含
. [flnh:MZ]            文件头内容
. [fled:0x55AA]        文件尾内容
. [fin:Hello]          文件全文内容
. [fln(2):3456]        某行内容
. [ex:ts] [fin:import] 多个条件组合
. [ex:sio] --run       搜索后打开每个文件
```

## 安装

VS Code → 扩展 → ... → 从 VSIX 安装 → 选择 `.vsix` 文件

## License
MIT

