/*
# Suivi de l'envoi des bulletins par e-mail

1. Résumé en français
   - Ajoute deux colonnes à `payroll_lines` pour tracer l'envoi du bulletin par
     courriel à chaque salarié.

2. Colonnes ajoutées à payroll_lines
   - `emailed_at` (timestamptz) — date/heure du dernier envoi réussi (NULL si non envoyé)
   - `email_error` (text) — message d'erreur du dernier envoi en échec (NULL si aucun)

3. Sécurité
   - Aucune modification de politique : les colonnes suivent les politiques RLS
     existantes de la table payroll_lines.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_lines' AND column_name = 'emailed_at'
  ) THEN
    ALTER TABLE public.payroll_lines ADD COLUMN emailed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payroll_lines' AND column_name = 'email_error'
  ) THEN
    ALTER TABLE public.payroll_lines ADD COLUMN email_error text;
  END IF;
END $$;
