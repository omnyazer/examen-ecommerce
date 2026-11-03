// src/pages/Register.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../services/config';

const passwordRequirements =
  'Le mot de passe doit contenir au moins 12 caractères, une majuscule, un chiffre et un caractère spécial.';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setError('');
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (
      Array.from(formData.password).length < 12 ||
      !/\p{Lu}/u.test(formData.password) ||
      !/[0-9]/.test(formData.password) ||
      !/[^\p{L}\p{N}\s]/u.test(formData.password)
    ) {
      setError(passwordRequirements);
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/auth/register`, formData, {
        withCredentials: true,
      });
      alert('Inscription réussie ! Vous pouvez maintenant vous connecter.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Une erreur est survenue. Veuillez réessayer.');
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-2xl font-bold mb-4 text-center">Inscription</h2>
        {error && (
          <p role="alert" className="text-red-500 mb-4">
            {error}
          </p>
        )}
        <input
          type="text"
          name="username"
          placeholder="Nom d'utilisateur"
          value={formData.username}
          onChange={handleChange}
          className="border border-gray-300 p-2 w-full mb-4"
        />
        <input
          type="email"
          name="email"
          placeholder="Adresse email"
          value={formData.email}
          onChange={handleChange}
          className="border border-gray-300 p-2 w-full mb-4"
        />
        <input
          type="password"
          name="password"
          placeholder="Mot de passe"
          aria-label="Mot de passe"
          aria-describedby="password-requirements"
          autoComplete="new-password"
          required
          minLength={12}
          value={formData.password}
          onChange={handleChange}
          className="border border-gray-300 p-2 w-full mb-4"
        />
        <p id="password-requirements" className="text-sm text-gray-600 mb-4">
          {passwordRequirements}
        </p>
        <button type="submit" className="bg-blue-500 text-white p-2 w-full rounded">
          S'inscrire
        </button>
      </form>
    </div>
  );
};

export default Register;
