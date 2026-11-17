# Andre Matos - Gerenciador 3C

Aplicativo Windows para organizar instalações do Sisloc 3C e criar atalhos dos clientes.

## Como funciona

- Monitora `Documentos\Sisloc` (incluindo a pasta Documentos redirecionada para OneDrive) e `AppData\Local\Sisloc`, incluindo a subpasta `sisloc`. Só lista pastas que contêm o executável exato `sisloc.exe`.
- Separa instalações ainda não organizadas das pastas já renomeadas e atualiza a lista automaticamente enquanto o app está aberto.
- Na aba de instalações organizadas, permite filtrar pelo nome da pasta, empresa sugerida ou local.
- Permite abrir a pasta da instalação selecionada no Explorer.
- Na aba **Baixar**, aceita links diretos ou abre o portal HTTP/HTTPS do cliente em uma janela isolada. No portal, o usuário clica no botão de instalação e o gerenciador captura o download iniciado pela página.
- Mostra o progresso, permite cancelar e salva arquivos em `Downloads\Gerenciador Sisloc` com nomes seguros e sem sobrescrever arquivos existentes. Há um botão para abrir essa pasta.
- Downloads nunca são extraídos ou executados automaticamente. Endereços HTTP são permitidos para servidores de clientes, mas exibem aviso; redirecionamentos de HTTPS para HTTP são bloqueados.
- Ao selecionar uma instalação, lê o `PSISLOC.ini` e preenche o nome da empresa como sugestão. O nome continua editável e nenhuma ação acontece até o usuário confirmar.
- Se a pasta ou o atalho com o nome escolhido já existir, a operação é bloqueada e informa o conflito. O usuário pode informar outro nome.
- Não apaga nem substitui pastas ou atalhos existentes.
- Permite apagar uma instalação organizada após confirmação e digitação exata do nome da pasta. A exclusão remove a pasta inteira e não pode ser desfeita.
- Renomeia a pasta no local onde a instalação foi encontrada e cria o atalho na Área de Trabalho apontando para `sisloc.exe` com o argumento `/client`.

## Desenvolvimento

Requer Node.js e Windows para testar a criação de atalhos.

```powershell
npm install
npm start
npm test
```

Para gerar o executável portátil do Windows:

```powershell
npm run dist:windows
```
