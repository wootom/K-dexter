import { RegistryService } from "../src/mcp-gateway/registry/service.js";
import { getToolRegistry } from "../src/tools/registry.js";
import { db } from "../src/mcp-gateway/db.js";

async function main() {
    console.log("🚀 Registering native tools to MCP Gateway...");

    const serverName = "k-dexter-native";

    // 1. Register/Update Server
    const serverId = RegistryService.registerServer(serverName, "native", {});
    console.log(`📡 Server '${serverName}' registered (ID: ${serverId})`);

    // 2. Map Native Tools to DB Format
    const nativeTools = getToolRegistry("native");
    const toolsToRegister = nativeTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.tool as any).schema
    }));

    // 3. Update Tools in DB
    RegistryService.updateTools(serverId, toolsToRegister);

    // 4. Set server to active
    db.run("UPDATE mcp_servers SET status = 'active' WHERE id = ?", [serverId]);

    console.log(`✅ Successfully registered ${toolsToRegister.length} native tools.`);
    toolsToRegister.forEach(t => console.log(`   - ${t.name}`));
}

main().catch(error => {
    console.error("❌ Failed to register native tools:", error);
    process.exit(1);
});
