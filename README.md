# ObraStock

Aplicativo PWA para controle de almoxarifado, ferramentas, retiradas, devolucoes e comprovantes de assinatura.

## 1. Criar o banco online no Supabase

1. Abra o projeto no Supabase.
2. Entre em `SQL Editor`.
3. Clique em `New query`.
4. Cole todo o conteudo do arquivo `supabase-schema.sql`.
5. Clique em `Run`.

Isso cria a tabela `obrastock_state` e libera o acesso pela chave publica do app.

## 2. Executar localmente

Abra `index.html` no navegador ou rode um servidor local dentro desta pasta:

```powershell
python -m http.server 4173
```

Depois abra:

```text
http://localhost:4173
```

## 3. Login inicial

```text
Usuario: admin
Senha: admin123
```

Outros acessos:

```text
Usuario: almox
Senha: almox123
```

```text
Usuario: viewer
Senha: viewer123
```

## 4. Publicar para celular

Publique esta pasta na Vercel ou Netlify. Depois abra o link no Chrome do celular e use `Adicionar a tela inicial`.

## Observacao de seguranca

Esta versao usa uma chave publica do Supabase e um login interno simples para ficar barata e facil de publicar. Para uso definitivo com CPF e dados reais, o proximo passo recomendado e trocar o login interno por Supabase Auth e regras de acesso por usuario.
