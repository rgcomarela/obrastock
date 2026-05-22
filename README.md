# ObraStock

PWA de cautela digital para almoxarifado de obras e equipes de campo.

## Foco

- Saber quem está com cada ferramenta, EPI ou material.
- Registrar entrega, devolução, estado do item e responsável.
- Manter cautela digital por funcionário.
- Reduzir papel com assinatura digital única por dia.
- Gerar PDF A4 apenas quando necessário: semanal, mensal ou individual.

## Login inicial

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

## Banco online

O app usa Supabase por meio da tabela `obrastock_state`, onde o estado do sistema fica salvo em JSON para sincronizar celular, tablet e computador.

## Publicação

O repositório está conectado à Vercel. Cada push na branch `main` publica uma nova versão automaticamente.
