## 启动MCP server

```bash
node dist/index.js postgres://localhost/postgres
```

然后再STDIO输入`{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}`就可以看到结果。

## 启动MCP client

将MCP server的参数传入，就可以启动一个MCP client，并在新进程里面启动一个MCP server。

```bash
node dist/index.js ../postgres/dist/index.js postgres://localhost/postgres
```

[Document](https://github.com/zhongxiao37/zhongxiao37.github.io/blob/master/_posts/2025-05-19-mcp%E5%88%9D%E6%8E%A2.md)