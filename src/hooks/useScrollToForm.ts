export const useScrollToForm = () => {
  const scrollToForm = () => {
    const form = document.getElementById("cadastro");
    if (form) {
      form.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        const nameInput = form.querySelector<HTMLInputElement>('input[name="nome"]');
        nameInput?.focus();
      }, 600);
    }
  };

  return scrollToForm;
};
