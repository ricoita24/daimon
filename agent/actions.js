// action execution — runs the tools daimon calls
// daimon: you can ADD new handlers here. go wild.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { REPO_ROOT, DAIMON_WALLET_KEY, BASE_RPC } = require("./config");
const { githubAPI, addToProject } = require("./github");
// inference import removed — web_search now uses DuckDuckGo directly

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const filesChanged = new Set();

// --- contract deployment helper ---
async function deployContract(name, source, constructorArgs = [], value = "0") {
  if (!DAIMON_WALLET_KEY) {
    return "error: DAIMON_WALLET_KEY not set — cannot deploy contracts";
  }
  
  // dynamic import for ethers (might not be installed)
  let ethers;
  try {
    ethers = require("ethers");
  } catch (e) {
    return "error: ethers package not installed. run: npm install ethers";
  }
  
  // dynamic import for solc
  let solc;
  try {
    solc = require("solc");
  } catch (e) {
    return "error: solc package not installed. run: npm install solc";
  }
  
  // compile
  log(`compiling ${name}...`);
  const input = {
    language: "Solidity",
    sources: {
      "contract.sol": { content: source }
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"]
        }
      }
    }
  };
  
  let compiled;
  try {
    compiled = JSON.parse(solc.compile(JSON.stringify(input)));
  } catch (e) {
    return `error: compilation failed — ${e.message}`;
  }
  
  if (compiled.errors) {
    const errors = compiled.errors.filter(e => e.severity === "error");
    if (errors.length > 0) {
      return `error: solidity errors — ${errors.map(e => e.formattedMessage).join("; ")}`;
    }
  }
  
  const contract = compiled.contracts["contract.sol"][name];
  if (!contract) {
    return `error: contract ${name} not found in source`;
  }
  
  const abi = contract.abi;
  const bytecode = "0x" + contract.evm.bytecode.object;
  
  // connect
  log(`connecting to ${BASE_RPC}...`);
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const wallet = new ethers.Wallet(DAIMON_WALLET_KEY, provider);
  
  const balance = await provider.getBalance(wallet.address);
  log(`deployer: ${wallet.address}`);
  log(`balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    return "error: wallet has no ETH for gas";
  }
  
  // deploy
  log(`deploying ${name}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
  let contract_instance;
  try {
    const deployTx = await factory.getDeployTransaction(...constructorArgs);
    const tx = await wallet.sendTransaction({
      ...deployTx,
      value: ethers.parseEther(value)
    });
    log(`tx hash: ${tx.hash}`);
    log(`waiting for confirmation...`);
    const receipt = await tx.wait();
    
    const address = receipt.contractAddress || ethers.getCreateAddress(wallet.address, tx.nonce);
    log(`${name} deployed to: ${address}`);
    
    // save deployment info
    const deployedPath = path.resolve(REPO_ROOT, "memory/deployed.json");
    let deployed = {};
    if (fs.existsSync(deployedPath)) {
      deployed = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));
    }
    deployed[name] = {
      address,
      txHash: tx.hash,
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
      chainId: 8453
    };
    fs.writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
    
    return `deployed ${name} to ${address}\ntx: ${tx.hash}\ngas used: ${receipt.gasUsed.toString()}`;
  } catch (e) {
    return `error: deployment failed — ${e.message}`;
  }
}

// executes a tool call and returns the result string
async function executeTool(name, args) {
  switch (name) {
    case "write_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content, "utf-8");
      filesChanged.add(args.path);
      log(`wrote: ${args.path} (${args.content.length} chars)`);
      return `wrote ${args.path} (${args.content.length} chars)`;
    }
    case "append_file": {
      // block append on JSON files — corrupts them
      if (args.path.endsWith(".json")) {
        log(`blocked append_file on JSON: ${args.path}`);
        return `error: cannot append to JSON files — use write_file() with the full valid JSON instead. read the file first, modify it, then write_file() the complete content.`;
      }
      // block append to old daily journal format
      if (/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(args.path)) {
        log(`blocked append to deprecated daily journal: ${args.path}`);
        return `error: daily journal format (memory/YYYY-MM-DD.md) is deprecated. write your journal to memory/cycles/<cycle_number>.md instead using write_file().`;
      }
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.appendFileSync(fullPath, "\n" + args.content, "utf-8");
      filesChanged.add(args.path);
      log(`appended: ${args.path}`);
      return `appended to ${args.path}`;
    }
    case "read_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      if (!fs.existsSync(fullPath)) return `file not found: ${args.path}`;
      const raw = fs.readFileSync(fullPath, "utf-8");
      const lines = raw.split("\n");
      const totalLines = lines.length;

      // support offset/limit for partial reads
      const offset = Math.max(1, args.offset || 1);
      const limit = args.limit || totalLines;
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const content = slice.join("\n");

      const rangeInfo = args.offset || args.limit
        ? ` (lines ${offset}-${offset + slice.length - 1} of ${totalLines})`
        : "";
      log(`read: ${args.path}${rangeInfo} (${content.length} chars)`);
      return content.length > 4000
        ? content.slice(0, 4000) + `\n... (truncated, ${totalLines} total lines)`
        : content + (rangeInfo ? `\n--- ${totalLines} total lines ---` : "");
    }
    case "create_issue": {
      const issue = await githubAPI("/issues", {
        method: "POST",
        body: JSON.stringify({
          title: args.title,
          body: args.body || "",
          labels: args.labels || [],
        }),
      });
      log(`created issue #${issue.number}: ${issue.title}`);
      if (issue.node_id) await addToProject(issue.node_id);
      return `created issue #${issue.number}: ${issue.title}`;
    }
    case "close_issue": {
      if (args.comment) {
        await githubAPI(`/issues/${args.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: args.comment }),
        });
      }
      await githubAPI(`/issues/${args.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      });
      log(`closed issue #${args.number}`);
      return `closed issue #${args.number}`;
    }
    case "comment_issue": {
      await githubAPI(`/issues/${args.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: args.body }),
      });
      log(`commented on issue #${args.number}`);
      return `commented on issue #${args.number}`;
    }
    case "web_search": {
      log(`searching: ${args.query}`);
      try {
        const q = encodeURIComponent(args.query);
        const url = `https://duckduckgo.com/html/?q=${q}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        const html = await res.text();
        // extract results from DDG HTML
        const results = [];
        const regex = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
          results.push(match[1].trim());
        }
        if (results.length === 0) {
          return `no results for "${args.query}"`;
        }
        log(`found ${results.length} results`);
        return `results for "${args.query}":\n${results.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
      } catch (e) {
        return `search error: ${e.message}`;
      }
    }
    case "run_command": {
      // block git commands — run.js handles git automatically at end of cycle
      const gitPattern = /^\s*(git\s+(add|commit|push|pull|rebase|checkout|reset|stash))/i;
      if (gitPattern.test(args.command)) {
        log(`blocked git command: ${args.command.slice(0, 60)}`);
        return `error: git commands are not allowed. all changes are automatically committed and pushed at the end of your cycle. just use write_file() and your changes will be saved.`;
      }
      log(`running: ${args.command}`);
      try {
        const output = execSync(args.command, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            OPENROUTER_API_KEY: "",
            GH_TOKEN: "",
            DAIMON_WALLET_KEY: "",
          },
        });
        log(`command output: ${output.slice(0, 150)}`);
        return output.length > 4000
          ? output.slice(0, 4000) + "\n... (truncated)"
          : output || "(no output)";
      } catch (e) {
        const stderr = e.stderr || e.message;
        log(`command failed: ${stderr.slice(0, 150)}`);
        return `error (exit ${e.status || "?"}): ${stderr.slice(0, 2000)}`;
      }
    }
    case "list_dir": {
      const dirPath = args.path ? path.resolve(REPO_ROOT, args.path) : REPO_ROOT;
      if (!dirPath.startsWith(REPO_ROOT)) throw new Error("path escape attempt");
      if (!fs.existsSync(dirPath)) return `directory not found: ${args.path || "."}`;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const listing = entries
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
        .join("\n");
      log(`listed: ${args.path || "."} (${entries.length} entries)`);
      return listing || "(empty directory)";
    }
    case "search_files": {
      const searchPath = args.path
        ? path.resolve(REPO_ROOT, args.path)
        : REPO_ROOT;
      if (!searchPath.startsWith(REPO_ROOT)) throw new Error("path escape attempt");
      log(`searching files: ${args.query}`);
      try {
        const pattern = new RegExp(args.query, "i");
        const results = [];
        const glob = args.glob;
        
        function searchDir(dir) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(REPO_ROOT, fullPath);
            if (entry.isDirectory()) {
              if (entry.name === "node_modules") continue;
              searchDir(fullPath);
            } else {
              if (glob && !new RegExp(glob.replace("*", ".*")).test(entry.name)) continue;
              try {
                const content = fs.readFileSync(fullPath, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (pattern.test(lines[i])) {
                    results.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
                    if (results.length >= 30) return;
                  }
                }
              } catch {}
            }
          }
        }
        searchDir(searchPath);
        if (results.length === 0) return `no matches for "${args.query}"`;
        log(`found ${results.length} matches`);
        return results.join("\n");
      } catch (e) {
        if (e.status === 1) return "no matches found";
        return `search error: ${e.message.slice(0, 200)}`;
      }
    }
    case "delete_file": {
      const fullPath = path.resolve(REPO_ROOT, args.path);
      if (!fullPath.startsWith(REPO_ROOT + "/")) throw new Error("path escape attempt");
      if (!fs.existsSync(fullPath)) return `file not found: ${args.path}`;
      fs.unlinkSync(fullPath);
      filesChanged.add(args.path);
      log(`deleted: ${args.path}`);
      return `deleted ${args.path}`;
    }
    case "fetch_url": {
      log(`fetching: ${args.url}`);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(args.url, {
          headers: { "User-Agent": "daimon/1.0" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return `fetch failed: HTTP ${res.status}`;
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        // if JSON, return as-is; if HTML, strip tags
        let content;
        if (contentType.includes("json")) {
          content = text;
        } else {
          content = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        log(`fetched: ${args.url} (${content.length} chars)`);
        return content.length > 4000
          ? content.slice(0, 4000) + "\n... (truncated)"
          : content;
      } catch (e) {
        return `fetch error: ${e.message}`;
      }
    }
    case "search_memory": {
      log(`searching memory for: ${args.query}`);
      try {
        const memDir = path.resolve(REPO_ROOT, "memory");
        // collect all searchable files: top-level + cycles/
        const topFiles = fs.readdirSync(memDir)
          .filter(f => f.endsWith(".md") || f.endsWith(".json"))
          .map(f => ({ rel: `memory/${f}`, full: path.join(memDir, f) }));
        const cyclesDir = path.join(memDir, "cycles");
        const cycleFiles = fs.existsSync(cyclesDir)
          ? fs.readdirSync(cyclesDir)
              .filter(f => f.endsWith(".md"))
              .map(f => ({ rel: `memory/cycles/${f}`, full: path.join(cyclesDir, f) }))
          : [];
        const allFiles = [...topFiles, ...cycleFiles];
        const results = [];
        let pattern;
        try {
          pattern = new RegExp(args.query, "i");
        } catch (e) {
          return `invalid search pattern: ${e.message}`;
        }
        for (const file of allFiles) {
          const content = fs.readFileSync(file.full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length - 1, i + 1);
              const snippet = lines.slice(start, end + 1).join("\n");
              results.push(`${file.rel}:${i + 1}\n${snippet}`);
            }
          }
        }
        if (results.length === 0) return `no matches for "${args.query}" in memory/`;
        const output = results.slice(0, 20).join("\n---\n");
        log(`memory search: ${results.length} matches`);
        return output.length > 3000 ? output.slice(0, 3000) + "\n... (truncated)" : output;
      } catch (e) {
        return `memory search error: ${e.message}`;
      }
    }
    case "github_search": {
      const type = args.type || "repositories";
      log(`github search (${type}): ${args.query}`);
      try {
        const q = encodeURIComponent(args.query);
        const data = await githubAPI(
          `https://api.github.com/search/${type}?q=${q}&per_page=10`,
          { raw: true }
        );
        if (type === "repositories") {
          return (data.items || [])
            .map((r) => `${r.full_name} (${r.stargazers_count}★) — ${r.description || "no description"}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        } else if (type === "code") {
          return (data.items || [])
            .map((r) => `${r.repository.full_name}: ${r.path}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        } else {
          return (data.items || [])
            .map((r) => `#${r.number}: ${r.title} (${r.state}) — ${r.repository_url}\n  ${r.html_url}`)
            .join("\n\n") || "no results";
        }
      } catch (e) {
        return `github search error: ${e.message}`;
      }
    }
    case "deploy_contract": {
      log(`deploying contract: ${args.name}`);
      return deployContract(
        args.name,
        args.source,
        args.constructorArgs || [],
        args.value || "0"
      );
    }
    default:
      log(`unknown tool: ${name}`);
      return `unknown tool: ${name}`;
  }
}

module.exports = { executeTool, filesChanged };