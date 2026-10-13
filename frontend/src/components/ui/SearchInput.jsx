import Icone from "../Icone";

export default function SearchInput(props) {
  return (
    <span className="ui-search-field">
      <Icone nome="busca" />
      <input {...props} />
    </span>
  );
}
