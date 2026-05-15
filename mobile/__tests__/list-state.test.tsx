import { render, fireEvent } from "@testing-library/react-native";
import { EmptyState, ErrorState } from "../components/list-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    const { getByText } = render(<EmptyState title="لا توجد بيانات" />);
    expect(getByText("لا توجد بيانات")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    const { getByText } = render(
      <EmptyState title="فارغ" description="لا يوجد شيء بعد" />
    );
    expect(getByText("لا يوجد شيء بعد")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("renders default Arabic copy", () => {
    const { getByText } = render(<ErrorState />);
    expect(getByText("تعذّر تحميل البيانات")).toBeTruthy();
    expect(getByText("تحقق من الاتصال ثم حاول مرة أخرى.")).toBeTruthy();
  });

  it("does not render retry button without onRetry", () => {
    const { queryByText } = render(<ErrorState />);
    expect(queryByText("إعادة المحاولة")).toBeNull();
  });

  it("calls onRetry when retry pressed", () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorState onRetry={onRetry} />);
    fireEvent.press(getByText("إعادة المحاولة"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
