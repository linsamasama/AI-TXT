import { render, screen } from '@testing-library/react';

jest.mock('./components/TaskList', () => () => <div>TaskList Mock</div>);
jest.mock('./components/StoryGenerator', () => () => <div>StoryGenerator Mock</div>);

import App from './App';

test('renders app header and main tabs', () => {
  render(<App />);
  expect(screen.getByText(/AI-TxT/i)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /文本改写/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /小说生成/i })).toBeInTheDocument();
});
