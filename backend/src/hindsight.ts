import { Router } from "express";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";
const HINDSIGHT_API_URL = process.env.HINDSIGHT_API_URL || "https://api.hindsight.vectorize.io";
const HINDSIGHT_BANK_ID = "aegis-agent-memory";

// Initialize the Hindsight Client
let hindsightClient: HindsightClient | null = null;

if (HINDSIGHT_API_KEY) {
  hindsightClient = new HindsightClient({
    baseUrl: HINDSIGHT_API_URL,
    apiKey: HINDSIGHT_API_KEY,
  });
  console.log("[AEGIS Backend] Hindsight Cloud memory bank initialized.");
} else {
  console.warn("[AEGIS Backend] WARNING: HINDSIGHT_API_KEY is missing. Memory is disabled.");
}

// 1. Retain (Save) a new memory
router.post("/retain", async (req, res) => {
  if (!hindsightClient) {
    return res.status(500).json({ error: "Hindsight API key not configured." });
  }

  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Missing 'content' in request body." });
  }

  try {
    await hindsightClient.retain(HINDSIGHT_BANK_ID, content);
    res.status(201).json({ success: true, message: "Memory retained successfully." });
  } catch (error) {
    console.error("[AEGIS Backend] Error retaining memory:", error);
    res.status(500).json({ error: "Failed to retain memory." });
  }
});

// 2. Recall (Search) memory context
router.post("/recall", async (req, res) => {
  if (!hindsightClient) {
    return res.status(500).json({ error: "Hindsight API key not configured." });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }

  try {
    const result = await hindsightClient.recall(HINDSIGHT_BANK_ID, query);
    
    // Extract text snippets from results
    const snippets: string[] = [];
    if (result.results && Array.isArray(result.results)) {
      for (const memory of result.results) {
        if (memory.text) snippets.push(memory.text);
      }
    }
    
    res.json({ success: true, facts: snippets, raw: result });
  } catch (error) {
    console.error("[AEGIS Backend] Error recalling memory:", error);
    res.status(500).json({ error: "Failed to recall memory." });
  }
});

// 3. List all stored memories (broad recall)
router.get("/list", async (req, res) => {
  if (!hindsightClient) {
    return res.status(500).json({ error: "Hindsight API key not configured." });
  }

  try {
    const result = await hindsightClient.recall(
      HINDSIGHT_BANK_ID, 
      "List all essential knowledge and facts about the user, their operations, and their headquarters."
    );
    
    const facts = (result.results || []).map((m: any, idx: number) => ({
      id: m.id ?? `mem-${idx}-${Date.now()}`,
      content: m.text ?? "",
      timestamp: m.mentioned_at ?? new Date().toISOString(),
    }));
    
    res.json({ success: true, facts });
  } catch (error) {
    console.error("[AEGIS Backend] Error listing memories:", error);
    res.status(500).json({ error: "Failed to list memories." });
  }
});

export default router;
