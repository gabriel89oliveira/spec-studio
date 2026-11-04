# Matriz de permissões

> Atualizado em: AAAA-MM-DD

Fonte única de quem pode fazer o quê e de quem enxerga quais dados. As features citam as ações daqui em vez de redescrever permissões.

Legenda: **S** = pode · **N** = não pode · **C** = pode, com condição (ver coluna Condição)

## Escopo de dados por perfil
| Perfil | Enxerga dados de | Observação |
|---|---|---|
| [Ex.: Gestor da empresa] | [todos os registros da própria empresa] | [—] |
| [Ex.: Parceiro externo] | [só os registros enviados a ele] | [não vê dados de outros parceiros] |

## M01 — [Nome do módulo]
| Ação | [Perfil 1] | [Perfil 2] | [Perfil 3] | [Perfil 4] | Condição |
|---|---|---|---|---|---|
| [Ex.: Criar registro] | S | N | C | N | [Perfil 3: só para itens vinculados a ele] |
| [Ex.: Aprovar registro] | C | N | N | N | [Perfil 1: até o limite de alçada definido] |
| [Ex.: Cancelar registro] | S | C | N | N | [Perfil 2: só antes de iniciar a execução] |

## M02 — [Nome do módulo]
| Ação | [Perfil 1] | [Perfil 2] | [Perfil 3] | [Perfil 4] | Condição |
|---|---|---|---|---|---|
| [ação] | | | | | |
