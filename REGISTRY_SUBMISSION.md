# Registry Submission Playbook

This repo is ready to submit the Asaptic Sourcing remote MCP server once Raymond completes the account, DNS, and public GitHub steps marked below.

Canonical service values:

- Legal owner: Asaptic (HK) Limited
- Brand: Asaptic
- Domain: asaptic.com
- Contact: engage@asaptic.com
- MCP server name: asaptic-sourcing
- MCP endpoint: https://asaptic.com/mcp
- MCP transport: streamable-http
- MCP tools: list_sourcing_lanes, get_lane_capability, get_engagement, submit_rfq

## 1. Official MCP Registry

Registry: https://modelcontextprotocol.io/publish

CLI flow:

1. Install or update the official publisher CLI:

   ```sh
   npm install -g mcp-publisher
   ```

2. From the repo root, validate the registry manifest:

   ```sh
   mcp-publisher validate server.json
   ```

3. Login with Raymond's registry account:

   ```sh
   mcp-publisher login
   ```

4. Publish:

   ```sh
   mcp-publisher publish server.json
   ```

Exact field values:

- Registry manifest path: `server.json`
- Namespace/name: `com.asaptic/asaptic-sourcing` - READY
- Description: `Factory-direct, regulatory-filtered sourcing of certified clinical devices and specialized components for Western and Global-South B2B buyers.` - READY
- Version: `1.0.0` - READY
- Website URL: `https://asaptic.com` - READY
- Remote transport: `streamable-http` - READY
- Remote URL: `https://asaptic.com/mcp` - READY
- Repository URL: `https://github.com/TODO_GITHUB_URL` - NEEDS RAYMOND: replace with the public GitHub repo URL before publishing

DNS ownership verification:

- Namespace being claimed: `com.asaptic`
- DNS zone: `asaptic.com`
- Record type: `TXT`
- Record name: `asaptic.com`
- Record value format: `mcp-verify=<token>`
- Status: NEEDS RAYMOND

The `mcp-publisher` CLI issues the exact verification token during namespace/domain verification. Raymond must add the TXT record in Cloudflare DNS for `asaptic.com`, wait for propagation, then rerun the publisher verification/publish command.

Raymond-owned checklist:

- NEEDS RAYMOND: registry account login
- NEEDS RAYMOND: Cloudflare TXT record `mcp-verify=<token>`
- NEEDS RAYMOND: replace `TODO_GITHUB_URL` with the real public repository URL

## 2. Smithery

Registry: https://smithery.ai/new

Submission flow:

1. Sign in to Smithery.
2. Choose the option to add/import an MCP server.
3. Provide the public GitHub repository URL.
4. Point Smithery to the config file at `smithery.yaml`.
5. Confirm the remote HTTP MCP endpoint.
6. Submit.

Exact field values:

- Display name: `Asaptic Sourcing` - READY
- Description: `Factory-direct, regulatory-filtered sourcing of certified clinical devices and specialized components for Western and Global-South B2B buyers.` - READY
- Homepage: `https://asaptic.com` - READY
- Runtime: `remote` - READY
- Type: `http` - READY
- Remote URL: `https://asaptic.com/mcp` - READY
- Config file path: `smithery.yaml` - READY
- Repository URL: `https://github.com/TODO_GITHUB_URL` - NEEDS RAYMOND: public repo URL

Raymond-owned checklist:

- NEEDS RAYMOND: Smithery account login
- NEEDS RAYMOND: public GitHub repo URL

## 3. Glama

Registry: https://glama.ai

Glama indexes MCP servers from public GitHub repositories.

Submission/indexing flow:

1. Make the GitHub repository public.
2. Ensure the repository includes the existing `.well-known/mcp.json` file.
3. Ensure the repository includes `server.json` and the MCP endpoint is live at `https://asaptic.com/mcp`.
4. If Glama provides a manual add/request form in the logged-in UI, submit the public repository URL.
5. Wait for indexing.

Exact field values:

- Repository URL: `https://github.com/TODO_GITHUB_URL` - NEEDS RAYMOND: public repo URL
- MCP manifest path: `.well-known/mcp.json` - READY
- MCP name: `asaptic-sourcing` - READY
- MCP endpoint: `https://asaptic.com/mcp` - READY
- MCP transport: `streamable-http` - READY
- Tools: `list_sourcing_lanes`, `get_lane_capability`, `get_engagement`, `submit_rfq` - READY
- Contact: `engage@asaptic.com` - READY

Raymond-owned checklist:

- NEEDS RAYMOND: Glama account/login only if manual submission is required
- NEEDS RAYMOND: public GitHub repo URL

## 4. mcp.so

Submission URL: https://mcp.so/submit

Submission flow:

1. Sign in to mcp.so.
2. Open `https://mcp.so/submit`.
3. Submit the MCP server using the exact values below.
4. If the form requires a repository, use the public GitHub repository URL after Raymond publishes it.

Exact field values:

- Name: `Asaptic Sourcing` - READY
- Slug/server id: `asaptic-sourcing` - READY
- Registry namespace: `com.asaptic/asaptic-sourcing` - READY
- Description: `Factory-direct, regulatory-filtered sourcing of certified clinical devices and specialized components for Western and Global-South B2B buyers.` - READY
- Website: `https://asaptic.com` - READY
- MCP endpoint URL: `https://asaptic.com/mcp` - READY
- Transport: `streamable-http` - READY
- Manifest URL: `https://asaptic.com/.well-known/mcp.json` - READY
- Tools: `list_sourcing_lanes`, `get_lane_capability`, `get_engagement`, `submit_rfq` - READY
- Contact email: `engage@asaptic.com` - READY
- Repository URL: `https://github.com/TODO_GITHUB_URL` - NEEDS RAYMOND: public repo URL

Raymond-owned checklist:

- NEEDS RAYMOND: mcp.so account login
- NEEDS RAYMOND: public GitHub repo URL
