import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Register from './Register';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

function submit(password) {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByPlaceholderText("Nom d'utilisateur"), {
    target: { value: 'client-test' },
  });
  fireEvent.change(screen.getByPlaceholderText('Adresse email'), {
    target: { value: 'client@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: "S'inscrire" }).closest('form'));
}

test.each([
  'Abcdefgh1!x',
  'abcdefghij1!',
  'Abcdefghijk!',
  'Abcdefghijk1',
  'Abcdefghij1 ',
  'Abcdefghij1é',
  'Abcdefgh1!😀',
])('un mot de passe non conforme est bloqué avant tout appel réseau : %s', (password) => {
  submit(password);
  expect(screen.getByRole('alert')).toHaveTextContent('au moins 12 caractères');
  expect(axios.post).not.toHaveBeenCalled();
});

test('un mot de passe conforme est transmis et les erreurs du serveur sont affichées', async () => {
  axios.post.mockRejectedValueOnce({
    response: { data: { message: 'Cet email est déjà utilisé.' } },
  });
  submit('Abcdefghij1!');
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Cet email est déjà utilisé.')
  );
  expect(axios.post).toHaveBeenCalledWith(
    'http://localhost:5000/api/auth/register',
    {
      username: 'client-test',
      email: 'client@example.test',
      password: 'Abcdefghij1!',
    },
    { withCredentials: true }
  );
});
