---
status: accepted
---

# JWT do Supabase verificado apenas por JWKS, atrás de `AuthProvider`

O Agente autentica cada Sincronização com o access token do Supabase Auth. O Gateway verifica o token localmente com a chave pública publicada em `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ES256; o projeto nasceu com chave assimétrica) e exige `iss` e `aud` do projeto. Não há suporte ao segredo HS256 legado: a própria Supabase o desencoraja, ele não aparece no JWKS e mantê-lo dobraria o código de verificação. A verificação fica atrás da interface `AuthProvider` (`verify(token) → { userId }`), para que trocar de provedor de identidade seja trocar uma implementação.

## Consequences

- O Agente ainda não envia token nenhum; o fim a fim depende de o app implementar login Supabase e o header `Authorization: Bearer`. Até lá o Gateway só é exercitável por testes (`FakeAuthProvider`) ou com um token obtido manualmente.
- Rotação de chave é transparente: o cliente JWKS busca `kid` desconhecidos e respeita o cache de 10 minutos recomendado pela Supabase.
