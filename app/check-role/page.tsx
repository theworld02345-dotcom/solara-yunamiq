"use client";

import { useState } from "react";

interface Role {
    id: string;
    name: string;
    color: string;
}

interface RoleResult {
    success: boolean;
    userId: string;
    username: string;
    displayName: string;
    roles: Role[];
}

export default function CheckRolePage() {
    const [userId, setUserId] = useState("");
    const [result, setResult] = useState<RoleResult | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCheck = async () => {
        if (!userId.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch(`/api/check-role?userId=${userId.trim()}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "เกิดข้อผิดพลาด");
            } else {
                setResult(data);
            }
        } catch {
            setError("ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f0f13] text-white flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <h1 className="text-2xl font-bold mb-2 text-white">ตรวจสอบยศ Discord</h1>
                <p className="text-zinc-400 text-sm mb-6">กรอก Discord User ID เพื่อดูยศในเซิร์ฟเวอร์</p>

                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                        placeholder="Discord User ID เช่น 123456789012345678"
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <button
                        onClick={handleCheck}
                        disabled={loading || !userId.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
                    >
                        {loading ? "กำลังตรวจ..." : "ตรวจสอบ"}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                        ❌ {error}
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-indigo-700 rounded-full flex items-center justify-center text-lg font-bold">
                                {result.displayName?.[0]?.toUpperCase() || "?"}
                            </div>
                            <div>
                                <p className="font-semibold text-white">{result.displayName}</p>
                                <p className="text-zinc-400 text-sm">@{result.username}</p>
                            </div>
                        </div>

                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 font-medium">
                            ยศทั้งหมด ({result.roles.length})
                        </p>

                        {result.roles.length === 0 ? (
                            <p className="text-zinc-500 text-sm">ไม่มียศ</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {result.roles.map((role) => (
                                    <span
                                        key={role.id}
                                        className="px-3 py-1 rounded-full text-xs font-medium border"
                                        style={{
                                            color: role.color === "#000000" ? "#a1a1aa" : role.color,
                                            borderColor:
                                                role.color === "#000000" ? "#3f3f46" : role.color + "55",
                                            backgroundColor:
                                                role.color === "#000000" ? "#18181b" : role.color + "15",
                                        }}
                                    >
                                        {role.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <p className="text-xs text-zinc-600 mt-6 text-center">
                    วิธีดู User ID: เปิด Discord → Developer Mode → คลิกขวาที่ชื่อคน → Copy User ID
                </p>
            </div>
        </div>
    );
}