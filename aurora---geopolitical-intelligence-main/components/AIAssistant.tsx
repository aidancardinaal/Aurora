"use client";
import { useState, useRef, useEffect } from "react";

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

export function AIAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: "init", role: "assistant", content: "Aurora Analyst online. How can I contextualize these geopolitical events for you?" }
    ]);
    const [input, setInput] = useState("");
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
    }, [messages, isOpen]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const newMsg: Message = { id: Date.now().toString(), role: "user", content: input };
        setMessages(prev => [...prev, newMsg]);
        setInput("");

        // Mock LLM response
        setTimeout(() => {
            const reply: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "Based on current market vectors and the recent surge in trading velocity, our analysis indicates a 65% correlation between these events and upcoming regional instability. We recommend closely monitoring the upcoming 72-hour window."
            };
            setMessages(prev => [...prev, reply]);
        }, 1200);
    };

    if (!isOpen) {
        return (
            <button className="ai-toggle-btn" onClick={() => setIsOpen(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>AURORA AI</span>
            </button>
        );
    }

    return (
        <div className="ai-panel">
            <div className="ai-header">
                <h3>AURORA AI ANALYST</h3>
                <button onClick={() => setIsOpen(false)}>×</button>
            </div>
            <div className="ai-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="msg-bubble">{msg.content}</div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
            <form className="ai-input" onSubmit={handleSend}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask about global events..."
                />
                <button type="submit">➔</button>
            </form>
        </div>
    );
}
