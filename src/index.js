const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};

const ALIASES = {
  codigo: ["material", "codigo", "cod", "sku"],
  descricao: ["descricao", "descricaomaterial", "texto breve material", "textobrevematerial"],
  categoria: ["categoria", "tipo", "tipomaterial", "tipodeinsumo", "grupomaterial"],
  um: ["um", "unidademedida", "unidadedemedida"],
  data: ["data", "datainclusao", "datadeinclusao"],
  responsavel: ["responsavel", "responsável"],
  imagem1: ["imagem1", "foto1", "imagem 1"],
  imagem2: ["imagem2", "foto2", "imagem 2"]
};

const ALLOWED_IMAGE_WIDTHS = [320, 480, 720, 960, 1280, 1600];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          app: "Catálogo de Insumos",
          spreadsheetId: env.GOOGLE_SHEET_ID || "",
          gid: env.GOOGLE_SHEET_GID || "",
          preferredSheet: env.GOOGLE_SHEET_NAME || "Base Materiais",
          fallbackSheet: env.GOOGLE_SHEET_FALLBACK_NAME || "Base etiquetas"
        }, 200, { "cache-control": "no-store" });
      }

      if (url.pathname === "/api/catalogo") {
        if (request.method !== "GET") return json({success:false,error:"Método não permitido."},405);
        return await catalogResponse(request, env, ctx);
      }

      if (url.pathname.startsWith("/img/")) {
        if (request.method !== "GET") return new Response("Método não permitido.", {status:405});
        return await imageResponse(request, ctx);
      }

      const asset = await env.ASSETS.fetch(request);
      return secureAsset(asset, url.pathname);
    } catch (error) {
      if (url.pathname.startsWith("/api/")) {
        return json({
          success:false,
          error:"Erro interno no catálogo.",
          details:error instanceof Error ? error.message : String(error)
        }, 500, {"cache-control":"no-store"});
      }
      return new Response("Erro interno.", {status:500, headers:SECURITY_HEADERS});
    }
  }
};

async function catalogResponse(request, env, ctx) {
  const url = new URL(request.url);
  const sheetId = String(env.GOOGLE_SHEET_ID || "").trim();
  const sheetGid = String(env.GOOGLE_SHEET_GID || "").trim();
  const preferredSheet = String(env.GOOGLE_SHEET_NAME || "Base Materiais").trim();
  const fallbackSheet = String(env.GOOGLE_SHEET_FALLBACK_NAME || "Base etiquetas").trim();
  const ttl = clampInt(env.CATALOG_CACHE_SECONDS, 30, 600, 120);
  const fresh = url.searchParams.get("fresh") === "1";

  if (!sheetId) {
    return json({success:false,error:"GOOGLE_SHEET_ID não configurado."},500,{"cache-control":"no-store"});
  }

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__edge/catalogo-insumos-v1`, {method:"GET"});

  if (!fresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const candidates = [...new Set([preferredSheet, fallbackSheet].filter(Boolean))];
  const loaded = await loadCatalogSheet(sheetId, sheetGid, candidates);

  if (!loaded) {
    return json({
      success:false,
      error:"Não foi possível ler a nova base de materiais. Confirme se a planilha está compartilhada para leitura por link."
    }, 502, {"cache-control":"no-store"});
  }

  const { table, sheetName, idx } = loaded;
  const defaultCategory = "Etiquetas";
  const data = [];

  for (const row of table.rows) {
    const cells = Array.isArray(row?.c) ? row.c : [];
    const codigo = cellText(cells[idx.codigo]);
    if (!codigo) continue;

    data.push({
      codigo,
      descricao: idx.descricao >= 0 ? cellText(cells[idx.descricao]) : "",
      categoria: idx.categoria >= 0 ? (cellText(cells[idx.categoria]) || defaultCategory) : defaultCategory,
      um: idx.um >= 0 ? cellText(cells[idx.um]) : "",
      data: idx.data >= 0 ? cellText(cells[idx.data]) : "",
      responsavel: idx.responsavel >= 0 ? cellText(cells[idx.responsavel]) : "",
      imagem1: idx.imagem1 >= 0 ? extractDriveId(cellText(cells[idx.imagem1])) : "",
      imagem2: idx.imagem2 >= 0 ? extractDriveId(cellText(cells[idx.imagem2])) : ""
    });
  }

  data.sort((a,b)=>a.codigo.localeCompare(b.codigo,"pt-BR",{numeric:true,sensitivity:"base"}));

  const categories = [...new Set(data.map(item => item.categoria).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));

  const response = json({
    success:true,
    total:data.length,
    categories,
    data,
    source:{
      sheetName,
      updatedAt:new Date().toISOString()
    }
  }, 200, {
    "cache-control":`public, max-age=30, s-maxage=${ttl}, stale-while-revalidate=600`
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function loadCatalogSheet(sheetId, sheetGid, candidates) {
  const sources = [];

  if (/^\d+$/.test(sheetGid)) {
    sources.push({
      label: `gid:${sheetGid}`,
      url:
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
        `/gviz/tq?tqx=out:json&headers=1&gid=${encodeURIComponent(sheetGid)}`
    });
  }

  for (const sheetName of candidates) {
    sources.push({
      label: sheetName,
      url:
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
        `/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`
    });
  }

  for (const source of sources) {
    try {
      const upstream = await fetch(source.url, {
        redirect:"follow",
        headers:{
          "accept":"application/json,text/plain,*/*",
          "user-agent":"CatalogoInsumosCloudflare/1.1"
        }
      });

      const text = await upstream.text();
      if (!upstream.ok || /^\s*</.test(text)) continue;

      const payload = parseGviz(text);
      if (payload.status === "error" || !payload.table?.cols || !payload.table?.rows) continue;

      const table = payload.table;
      const headers = table.cols.map((col,index)=>({
        index,
        raw:String(col?.label || col?.id || `coluna${index+1}`).trim(),
        key:normalize(col?.label || col?.id || `coluna${index+1}`)
      }));

      const idx = {};
      for (const [key, aliases] of Object.entries(ALIASES)) {
        idx[key] = findColumn(headers, aliases);
      }

      if (idx.codigo < 0 || idx.descricao < 0) continue;
      return { table, sheetName: source.label, idx };
    } catch {
      // Tenta a próxima referência configurada.
    }
  }

  return null;
}

async function imageResponse(request, ctx) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/img/".length)).trim();

  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) {
    return new Response("Imagem inválida.", {status:400, headers:SECURITY_HEADERS});
  }

  const requested = Number(url.searchParams.get("w") || 480);
  const width = nearestAllowedWidth(requested);

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__edge/img/${id}?w=${width}`, {method:"GET"});
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const driveUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
  const upstream = await fetch(driveUrl, {
    redirect:"follow",
    headers:{
      "accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent":"Mozilla/5.0"
    }
  });

  if (!upstream.ok) {
    return new Response("Imagem indisponível.", {
      status: upstream.status === 404 ? 404 : 502,
      headers: {
        ...SECURITY_HEADERS,
        "cache-control":"public, max-age=60"
      }
    });
  }

  const type = upstream.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    return new Response("Arquivo não é uma imagem pública.", {
      status:502,
      headers:{...SECURITY_HEADERS,"cache-control":"public, max-age=60"}
    });
  }

  const headers = new Headers();
  headers.set("content-type", type);
  headers.set("cache-control", "public, max-age=2592000, immutable");
  headers.set("cdn-cache-control", "public, max-age=2592000");
  headers.set("x-content-type-options", "nosniff");

  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);

  const response = new Response(upstream.body, {status:200, headers});
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta do Google Sheets inválida.");
  return JSON.parse(text.slice(start,end+1));
}

function cellText(cell) {
  if (!cell) return "";
  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
  return "";
}

function extractDriveId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let match = text.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (!match) match = text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (!match && /^[A-Za-z0-9_-]{10,200}$/.test(text)) return text;
  return match?.[1] || "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]/g,"");
}

function findColumn(headers, aliases) {
  const wanted = aliases.map(normalize);
  for (const alias of wanted) {
    const exact = headers.find(h=>h.key === alias);
    if (exact) return exact.index;
  }
  for (const alias of wanted) {
    const partial = headers.find(h=>alias.length >= 3 && h.key.includes(alias));
    if (partial) return partial.index;
  }
  return -1;
}

function nearestAllowedWidth(value) {
  const safe = Number.isFinite(value) ? Math.max(200, Math.min(1600, value)) : 480;
  return ALLOWED_IMAGE_WIDTHS.reduce((best,current)=>
    Math.abs(current-safe) < Math.abs(best-safe) ? current : best
  , ALLOWED_IMAGE_WIDTHS[0]);
}

function clampInt(value,min,max,fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min,Math.min(max,Math.floor(parsed))) : fallback;
}

function json(body,status=200,extra={}) {
  const headers = new Headers({
    "content-type":"application/json; charset=UTF-8",
    ...SECURITY_HEADERS,
    ...extra
  });
  return new Response(JSON.stringify(body),{status,headers});
}

function secureAsset(response, pathname) {
  const out = new Response(response.body,response);
  for (const [key,value] of Object.entries(SECURITY_HEADERS)) out.headers.set(key,value);

  if (pathname === "/" || pathname.endsWith(".html")) {
    out.headers.set("cache-control","public, max-age=60, must-revalidate");
  } else if (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".webmanifest")) {
    out.headers.set("cache-control","public, max-age=300, must-revalidate");
  }
  return out;
}
