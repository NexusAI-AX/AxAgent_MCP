const fs = require('fs');
const path = require('path');
const express = require('express');
const { spawn } = require('child_process');

// load config
const configPath = path.join(__dirname, '../frnt/mcp_config.json');
let config;
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw);
} catch (err) {
  console.error('Failed to load mcp_config.json:', err);
  process.exit(1);
}

const servers = config.mcpServers || {};
const defaultServer = Object.keys(servers)[0];
const app = express();
const PORT = process.env.MCP_PORT || 3002;

function runMcp(res, serverName, mcpArg) {
  const server = servers[serverName];
  if (!server) {
    res.status(400).json({ error: `Unknown server ${serverName}` });
    return;
  }

  console.log(`Starting MCP '${serverName}' with arg '${mcpArg}'`);
  const proc = spawn(server.command, [...server.args, mcpArg]);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders();

  proc.stdout.on('data', (data) => {
    data
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => {
        res.write(`data: ${line}\n\n`);
      });
  });

  proc.stderr.on('data', (data) => {
    console.error(`[${serverName} stderr]`, data.toString());
  });

  proc.on('error', (err) => {
    console.error(`[${serverName} error]`, err);
    res.write(`event: error\ndata: ${err.message}\n\n`);
    res.end();
  });

  proc.on('close', (code) => {
    console.log(`[${serverName}] exited with code ${code}`);
    res.write(`event: end\ndata: ${code}\n\n`);
    res.end();
  });
}

['resources', 'prompts', 'tools'].forEach((route) => {
  app.get(`/mcp/${route}`, (req, res) => {
    const serverName = req.query.server || defaultServer;
    runMcp(res, serverName, route);
  });
});

app.listen(PORT, () => {
  console.log(`MCP server listening on port ${PORT}`);
});
