import { Game } from './Game';

const game = new Game(document.getElementById('app')!);
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
game
  .init()
  .then(() => game.start())
  .catch((err) => {
    console.error(err);
    document.getElementById('loading')!.textContent = `Failed to load: ${err}`;
  });
