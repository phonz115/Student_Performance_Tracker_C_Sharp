type HeaderProps = {
  title: string;
  className?: string;
};

const Header = ({ title, className = '' }: HeaderProps) => {
  return (
    <header className={`app-header ${className}`.trim()}>
      <h1>{title}</h1>
    </header>
  );
};

export default Header;
