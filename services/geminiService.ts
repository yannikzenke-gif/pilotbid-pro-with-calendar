import { GoogleGenAI } from "@google/genai";
import { Pairing } from "../types";
import { format } from "date-fns";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeSchedule = async (pairings: Pairing[], userQuery: string): Promise<string> => {
  try {
    // Limit context to prevent token overflow. Take top 30 filtered pairings.
    const contextPairings = pairings.slice(0, 30).map(p => ({
      id: p.pairingNumber,
      ac: p.aircraftType,
      dep: format(p.departureTime, 'MMM dd HH:mm'),
      arr: format(p.arrivalTime, 'MMM dd HH:mm'),
      dur: p.duration,
      route: p.details
    }));

    const prompt = `
      You are an intelligent assistant for an airline pilot using a bidding app called "PilotBid Pro".
      
      The pilot has filtered their monthly schedule and is asking a question about the remaining available flights.
      
      Here is a sample of the filtered pairings (JSON format):
      ${JSON.stringify(contextPairings)}

      User Question: "${userQuery}"

      Please provide a helpful, professional, and concise answer. 
      If suggesting specific pairings, refer to them by their Pairing ID.
      Highlight specific pros/cons like "good for maximizing block hours" or "easy turn-around".
      If the list seems empty or irrelevant to the query, advise them to adjust filters.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "I couldn't generate a response. Please try rephrasing.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Sorry, I encountered an error analyzing your schedule. Please check your API key or try again later.";
  }
};