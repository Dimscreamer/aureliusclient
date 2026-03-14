{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
  ];
  idx = {
    extensions = [
      "dbaeumer.vscode-eslint"
    ];
    workspace = {
      onCreate = {
        npm-install = "npm install";
      };
      onStart = {
        # If you have a development server, you can start it here
        # dev-server = "npm run dev";
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npx", "firebase", "serve", "--only", "hosting", "--port", "$PORT"];
          manager = "web";
        };
      };
    };
  };
}
