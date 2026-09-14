import { NextRequest,NextResponse } from "next/server";
import { consumeAttempt } from "@/lib/rate-limit";
export function proxy(request:NextRequest){if(request.nextUrl.pathname.startsWith("/api/auth/"))return NextResponse.next();if(["POST","PUT","PATCH","DELETE"].includes(request.method)){const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Origem da requisição não permitida."},{status:403});const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local";if(!consumeAttempt(`api:${ip}`,120,60_000).allowed)return NextResponse.json({error:"Muitas operações em pouco tempo."},{status:429})}return NextResponse.next()}
export const config={matcher:"/api/:path*"};
