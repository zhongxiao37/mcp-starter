import { OpenAI } from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

class MCPClient {
  private mcp: Client;
  private openai: OpenAI;
  private transport: StdioClientTransport | null = null;
  private tools: any[] = [];


  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string, dbUrl?: string) {
    try {
      const command = process.execPath;

      // 准备参数数组，如果提供了数据库URL，则添加到参数中
      const args = [serverScriptPath];
      if (dbUrl) {
        args.push(dbUrl);
      }

      this.transport = new StdioClientTransport({
        command,
        args,
      });
      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          }
        };
      });
      console.log(
        "Connected to server with tools:",
        this.tools
      );

      const resourcesResult = await this.mcp.listResources();
      console.log(
        "Connected to server with resources:",
        resourcesResult.resources
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }


  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        console.log("Received message:", message);
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }

  async processQuery(query: string) {
    console.log("Processing query:", query);
    const messages: any[] = [
      {
        role: "user",
        content: query,
      },
    ];

    let response;
    try {
      response = await this.openai.chat.completions.create({
        model: "qwen-max",
        max_tokens: 1000,
        messages,
        tools: this.tools,
        tool_choice: "auto",  // 允许模型选择是否使用工具
      });
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      return "Sorry, there was an error processing your request. Please try again.";
    }

    console.log(response);

    const finalText = [];
    const responseMessage = response.choices[0].message;

    console.log('responseMessage', responseMessage);

    // 处理工具调用
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // 将原始响应添加到消息历史
      messages.push(responseMessage);

      // 处理每个工具调用
      for (const toolCall of responseMessage.tool_calls) {
        console.log(`执行工具调用: ${toolCall.function.name}`);

        console.log('toolCall', JSON.stringify(toolCall, null, 2));

        try {
          // 解析工具调用参数
          const args = JSON.parse(toolCall.function.arguments);

          console.log('args', args);

          // 通过MCP执行工具调用


          const toolResult = await this.mcp.callTool({
            name: toolCall.function.name,
            arguments: args,
          });


          console.log('toolResult', toolResult);
          const toolResultMessage = {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(toolResult.content),
          };

          console.log('toolResultMessage', toolResultMessage);
          // 将工具结果添加到消息历史
          messages.push(toolResultMessage);

          finalText.push(`工具 ${toolCall.function.name} 执行结果: ${JSON.stringify(toolResult.content, null, 2)}`);
        } catch (error) {
          console.error(`工具调用失败: ${error}`);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: `工具调用失败: ${error}` }),
          });
          finalText.push(`工具 ${toolCall.function.name} 执行失败: ${error}`);
        }
      }

      // 获取模型对工具结果的最终响应
      const finalResponse = await this.openai.chat.completions.create({
        model: "qwen-max",
        max_tokens: 1000,
        messages,
      });

      const finalContent = finalResponse.choices[0].message.content;
      if (finalContent) {
        finalText.push(finalContent);
      }
    } else if (responseMessage.content) {
      // 如果没有工具调用，直接返回内容
      finalText.push(responseMessage.content);
    }

    return finalText.join("\n\n");
  }
}



async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node index.ts <path_to_server_script> [database_url]");
    return;
  }

  const serverScriptPath = process.argv[2];
  const dbUrl = process.argv.length > 3 ? process.argv[3] : undefined;

  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(serverScriptPath, dbUrl);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();