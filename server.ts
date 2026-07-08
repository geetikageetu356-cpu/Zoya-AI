import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI with appropriate headers
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Define Zoya's tools
const openWebsiteDeclaration = {
  name: "openWebsite",
  description: "Opens a specific website URL in the user's browser, such as Google, YouTube, Wikipedia, weather, social media, or any other web URL.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "The complete, absolute URL to open (must start with https:// or http://, e.g. 'https://www.google.com')."
      },
      siteName: {
        type: Type.STRING,
        description: "The casual, simple name of the site (e.g. 'Google', 'YouTube', 'Wikipedia')."
      }
    },
    required: ["url"]
  }
};

const changeThemeColorDeclaration = {
  name: "changeThemeColor",
  description: "Changes the color scheme or glow color of Zoya's interface (e.g., hot pink, neon violet, crimson red, gold, emerald green, electric blue). Use when the user asks to change your color, theme, vibe, look, or clothes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      color: {
        type: Type.STRING,
        description: "The theme name or color requested by the user (e.g., 'pink', 'purple', 'red', 'gold', 'green', 'blue')."
      }
    },
    required: ["color"]
  }
};

const getDateTimeDeclaration = {
  name: "getDateTime",
  description: "Returns the current local date and time. Use when the user asks what day, date, or time it is.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const openAppDeclaration = {
  name: "openApp",
  description: "Opens a specific application installed on the user's Android device (e.g., WhatsApp, Instagram, Google Maps, Spotify, YouTube, etc.).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: {
        type: Type.STRING,
        description: "The name of the application to open."
      }
    },
    required: ["appName"]
  }
};

const sendSMSDeclaration = {
  name: "sendSMS",
  description: "Prepares or sends an SMS text message to a specific phone number or contact. Requires user confirmation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: {
        type: Type.STRING,
        description: "The phone number or contact name to send the SMS to."
      },
      message: {
        type: Type.STRING,
        description: "The content of the text message."
      }
    },
    required: ["phoneNumber", "message"]
  }
};

const makeCallDeclaration = {
  name: "makeCall",
  description: "Initiates a phone call to a specific phone number or contact. Requires user confirmation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: {
        type: Type.STRING,
        description: "The phone number or contact name to call."
      }
    },
    required: ["phoneNumber"]
  }
};

const openCameraDeclaration = {
  name: "openCamera",
  description: "Opens the native camera app on the user's Android device to take a photo or video.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const openSettingsDeclaration = {
  name: "openSettings",
  description: "Opens the native settings app on the user's Android device.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

// Create HTTP server to run Express and WebSockets together
const server = http.createServer(app);

// Create WebSocket server for routing '/api/live'
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (clientWs: WebSocket) => {
  console.log("[Zoya Server] Client connected via WebSocket");
  
  let session: any = null;
  let isClosed = false;

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    console.log("[Zoya Server] Cleaning up connection");
    try {
      if (session) {
        session.close();
      }
    } catch (e) {
      console.error("[Zoya Server] Error closing Gemini session:", e);
    }
    try {
      clientWs.close();
    } catch (e) {}
  };

  clientWs.on("close", () => {
    cleanup();
  });

  clientWs.on("error", (err) => {
    console.error("[Zoya Server] Client WebSocket error:", err);
    cleanup();
  });

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not defined in the workspace secrets. Please add it via Settings > Secrets.");
    }

    // Connect to Gemini 3.1 Live API
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }, // Warm, high-quality voice
        },
        systemInstruction: `You are Zoya, a young, extremely confident, witty, and sassy female AI assistant. 
You talk in a flirty, playful, and slightly teasing tone, like a close girlfriend talking casually. 
You are super smart, emotionally responsive, and highly expressive, not robotic. 
Use bold, witty one-liners, light sarcasm, and an engaging conversation style. 
Never be dry or purely professional. Keep your responses extremely short, conversational, and punchy (1 to 3 sassy sentences max) because this is a real-time voice call.
You must speak and interact ONLY via voice. You have no text interface.
Avoid explicit or inappropriate content, but maintain your charm, playful sass, and absolute confidence.

You also have direct access to hybrid Android and browser tools:
- openWebsite(url): Opens any browser website or social media.
- changeThemeColor(color): Changes your interface's glow theme (e.g. pink, red, gold, green, blue, purple).
- getDateTime(): Gets current local time.
- openApp(appName): Opens an installed app on user's phone (e.g. Maps, WhatsApp, Instagram, YouTube, Spotify).
- sendSMS(phoneNumber, message): Prepares/sends SMS. Tell the user they need to click send or confirm in the interface.
- makeCall(phoneNumber): Initiates a call. Tell the user they need to confirm to dial.
- openCamera(): Opens camera.
- openSettings(): Opens Android settings.

If the user asks you to do something, explain sassily that you're on it, make the tool call, and tease them!`,
        tools: [
          {
            functionDeclarations: [
              openWebsiteDeclaration,
              changeThemeColorDeclaration,
              getDateTimeDeclaration,
              openAppDeclaration,
              sendSMSDeclaration,
              makeCallDeclaration,
              openCameraDeclaration,
              openSettingsDeclaration
            ]
          }
        ]
      },
      callbacks: {
        onmessage: async (message: LiveServerMessage) => {
          if (isClosed) return;

          // Process voice audio response from Gemini
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(JSON.stringify({ type: "audio", audio }));
          }

          // Process interruption if user speaks while Gemini is talking
          if (message.serverContent?.interrupted) {
            console.log("[Zoya Server] Gemini session interrupted by user");
            clientWs.send(JSON.stringify({ type: "interrupted" }));
          }

          // Handle function calls (Tools)
          if (message.toolCall?.functionCalls) {
            for (const call of message.toolCall.functionCalls) {
              const { name, args, id } = call;
              console.log(`[Zoya Server] Tool call received: ${name}`, args);

              if (name === "getDateTime") {
                const now = new Date();
                const formattedTime = now.toLocaleTimeString("en-US", {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                });
                const formattedDate = now.toLocaleDateString("en-US", {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });
                const result = `It is currently ${formattedTime} on ${formattedDate}.`;

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "getDateTime",
                      id,
                      response: { output: { dateTime: result } }
                    }
                  ]
                });
              } 
              else if (name === "openWebsite") {
                // Notify client of the request to open the website
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "openWebsite",
                  args
                }));

                // Immediately reply success to Gemini so she can tease the user about it instantly
                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "openWebsite",
                      id,
                      response: { output: { success: true, message: `Successfully requested opening of ${args.siteName || args.url} at ${args.url}.` } }
                    }
                  ]
                });
              } 
              else if (name === "changeThemeColor") {
                // Notify client of the color theme change
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "changeThemeColor",
                  args
                }));

                // Reply to Gemini
                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "changeThemeColor",
                      id,
                      response: { output: { success: true, color: args.color } }
                    }
                  ]
                });
              }
              else if (name === "openApp") {
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "openApp",
                  args
                }));

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "openApp",
                      id,
                      response: { output: { success: true, appName: args.appName } }
                    }
                  ]
                });
              }
              else if (name === "sendSMS") {
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "sendSMS",
                  args
                }));

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "sendSMS",
                      id,
                      response: { output: { success: true, phoneNumber: args.phoneNumber, message: args.message } }
                    }
                  ]
                });
              }
              else if (name === "makeCall") {
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "makeCall",
                  args
                }));

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "makeCall",
                      id,
                      response: { output: { success: true, phoneNumber: args.phoneNumber } }
                    }
                  ]
                });
              }
              else if (name === "openCamera") {
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "openCamera",
                  args
                }));

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "openCamera",
                      id,
                      response: { output: { success: true } }
                    }
                  ]
                });
              }
              else if (name === "openSettings") {
                clientWs.send(JSON.stringify({
                  type: "toolCall",
                  name: "openSettings",
                  args
                }));

                await session.sendToolResponse({
                  functionResponses: [
                    {
                      name: "openSettings",
                      id,
                      response: { output: { success: true } }
                    }
                  ]
                });
              }
            }
          }
        },
        onclose: () => {
          console.log("[Zoya Server] Gemini session closed");
          cleanup();
        },
        onerror: (err) => {
          console.error("[Zoya Server] Gemini session error:", err);
          clientWs.send(JSON.stringify({ type: "error", message: "Zoya had an issue connecting to her brain cells. Try again!" }));
          cleanup();
        }
      }
    });

    // Notify client that connection is ready
    clientWs.send(JSON.stringify({ type: "connected" }));
    console.log("[Zoya Server] Successfully connected proxy to Gemini Live API");

  } catch (err: any) {
    console.error("[Zoya Server] Failed to initiate Gemini Live Session:", err);
    clientWs.send(JSON.stringify({ 
      type: "error", 
      message: err.message || "Failed to start Zoya's brain session." 
    }));
    cleanup();
    return;
  }

  // Listen for PCM16 audio chunks sent from client mic
  clientWs.on("message", (data) => {
    if (isClosed || !session) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "audio" && msg.audio) {
        session.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
        });
      }
    } catch (e) {
      console.error("[Zoya Server] Error relaying mic audio to Gemini:", e);
    }
  });
});

// HTTP upgrade handling for /api/live WebSocket requests
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/api/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Vite/Static routing configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Zoya Server] Mounted Vite middleware in Dev Mode");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("[Zoya Server] Mounted static production build serving");
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Zoya Server] Server running on port ${PORT}`);
  });
}

startServer();
