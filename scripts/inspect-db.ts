import { db } from "../src/mcp-gateway/db.js";

async function main() {
    console.log("--- Servers ---");
    const servers = db.query("SELECT * FROM mcp_servers").all();
    console.table(servers);

    console.log("\n--- Tools ---");
    const tools = db.query("SELECT t.id, t.name, s.name as server_name FROM mcp_tools t JOIN mcp_servers s ON t.server_id = s.id").all();
    console.table(tools);

    console.log("\n--- Policies ---");
    const policies = db.query("SELECT * FROM policies").all();
    console.table(policies);

    console.log("\n--- API Keys ---");
    const keys = db.query("SELECT id, name, role, is_active FROM api_keys").all();
    console.table(keys);
}

main().catch(console.error);
