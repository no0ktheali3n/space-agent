<p align="center">
  <a href="https://space-agent.ai"><img src="./server/pages/res/astronaut_no_bg.webp" alt="Space Agent astronaut" width="280" /></a>
</p>

<h1 align="center">Space Agent</h1>

<h3 align="center">
  <strong>Your personal AI workspace. Lives in your browser. Belongs to you.</strong>
</h3>

<p align="center">
  <a href="https://space-agent.ai"><img alt="Try Live Now!" height="64" src="https://img.shields.io/badge/Try%20Live%20Now%21-00D9FF?style=for-the-badge&labelColor=07111F&color=00D9FF" /></a>
  <br />
  <br />
  <a href="https://github.com/agent0ai/space-agent/releases/latest"><img alt="Run locally via App" height="50" src="https://img.shields.io/badge/Run%20locally%20via%20App-59F0A8?style=for-the-badge&labelColor=07111F&color=59F0A8" /></a>
  <a href="#host"><img alt="Host yourself as a server" height="50" src="https://img.shields.io/badge/Host%20yourself%20as%20a%20server-FFFFFF?style=for-the-badge&labelColor=07111F&color=FFFFFF" /></a>
</p>

<h3 align=center>Created by <a href="https://agent-zero.ai">Agent Zero</a>.</h3>

<p align="center">
  <a href="https://discord.gg/B8KZKNsPpj"><img alt="Discord" src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" /></a>
  &nbsp;
  <a href="https://www.youtube.com/@AgentZeroFW"><img alt="YouTube" src="https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white" /></a>
  &nbsp;
  <a href="https://deepwiki.com/agent0ai/space-agent"><img alt="Ask DeepWiki" src="https://deepwiki.com/badge.svg" /></a>
</p>

---

## Meet Space Agent

Space Agent gives AI a place to live, right in your browser. Chat with your agent, build spaces, add widgets, manage files, try local models, and keep the whole experience close to your machine.

It is made for people who want an agent they can actually own: run it live, download the app, or host it yourself with a few commands.

<table>
  <tr>
    <td align="center" width="33%">
      <img src="./app/L0/_all/mod/_core/admin/res/helmet_no_bg_256.webp" alt="Agent helmet" width="92" />
      <br />
      <strong>Your agent, on screen</strong>
      <br />
      A visible assistant that lives in the workspace with you.
    </td>
    <td align="center" width="33%">
      <img src="./packaging/resources/icons/source/space-agent-icon-256.webp" alt="Space Agent app icon" width="92" />
      <br />
      <strong>App or self-hosted</strong>
      <br />
      Use the desktop app or run your own server.
    </td>
    <td align="center" width="33%">
      <img src="./app/L0/_all/mod/_core/admin/res/astronaut_no_bg.webp" alt="Space Agent avatar" width="92" />
      <br />
      <strong>Built for AI teamwork</strong>
      <br />
      <code>AGENTS.md</code> and DeepWiki help agents understand the project.
    </td>
  </tr>
</table>

## Why It Feels Different

**It runs where you already work.** The agent can click every button you click, and edit any file in the workspace. There's no "agent mode" with a smaller set of tools, it works with the whole app the same way you do.

**Local-first when you want it.** Run the native app and nothing leaves it, or self-host an instance and keep everything in your own network. No mandatory cloud, no telemetry you didn't opt into.

**Reshape it without rebuilding it.** Ask for a new page, a new tool, or a different default, and the agent writes the code, and reloads. Nothing to learn and to maintain. The app you're customizing and the agent are the same thing.

## What You Can Do

<table>
  <tr>
    <td width="50%">
      <h3>Build your own AI space</h3>
      <p>Create dashboards, add widgets, save files, test models, and keep the agent close to the work instead of trapped in a separate chat tab.</p>
      <p>Space Agent is meant to feel like a personal command deck: practical, visual, and yours to reshape.</p>
    </td>
    <td align="center" width="50%">
      <img src="./app/L0/_all/mod/_core/admin/res/astronaut_no_bg.webp" alt="Admin agent astronaut" width="210" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="./app/L0/_all/mod/_core/admin/res/helmet_no_bg_256.webp" alt="Admin agent helmet" width="150" />
    </td>
    <td width="50%">
      <h3>Run it your way</h3>
      <p>Try it live, install the app, or host it yourself. The same project can be a personal local tool or a shared server for a team.</p>
      <p>Admin mode gives operators a place to manage users, files, modules, and agent settings.</p>
    </td>
  </tr>
</table>

## Features

**Spaces.** Dashboards, tools, widgets: arrange them the way you think. Each space is yours to shape; the agent helps you build and refine them.

**Real work, not just chat.** Open PDFs, print documents, generate reports, download files, call external APIs, pull local models. The agent handles it, inside the same workspace you're already in.

**Self-extending.** The agent can write new modules on the fly, for you, for your team, or for everyone on the server. No plugins, no waiting. Ask for a feature and it builds it.

**Time travel.** Every data folder is a git repository. If something breaks, roll back to any earlier state. History is automatic; restoration is one step.

**Admin area.** A persistent layer that keeps the system running even when the agent is rewriting parts of itself. The agent can modify the workspace, but it can't break its own foundation.

## Try it in 30 seconds

# [space-agent.ai](https://space-agent.ai)

No signup. Type a message and you have your first Space.

## Run it yourself

### The desktop app

Grab the latest build from [GitHub Releases](https://github.com/agent0ai/space-agent/releases/latest). It starts the runtime for you and opens Space Agent. No terminal required.

### A real server, for you or your team

```bash
git clone https://github.com/agent0ai/space-agent.git
cd space-agent
npm install

# create yourself an admin
node space user create admin --password "change-me-now" --full-name "Admin" --groups _admin

# zero-downtime server, with auto-update
node space serve
```

### For development

```bash
npm run dev          # server with auto-reload
```
### For production

```bash
node space supervise          # production server
```

<details>
<summary><strong>Useful CLI commands</strong></summary>

| Command | What it does |
| --- | --- |
| `node space serve` | Start Space Agent. |
| `node space supervise` | Production runner with zero-downtime updates and crash restart. |
| `node space get` | Show saved settings. |
| `node space set KEY=VALUE` | Save settings to `.env`. |
| `node space user create` | Create a user, optionally with `--groups`. |
| `node space user password` | Reset a password and clear sessions. |
| `node space group create` | Create an `L1/<group>` group. |
| `node space group add` | Add a user or group to another group. |
| `node space update` | Pull updates from Git. |
| `node space help` | Discover everything else. |

Settings live in [`commands/params.yaml`](./commands/params.yaml).

</details>

## AI-ready documentation

Space Agent ships with an `AGENTS.md` documentation hierarchy. It's written and followed by AI. DeepWiki indexes the rest.

If you want the deep tour, start here:

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agent0ai/space-agent)
