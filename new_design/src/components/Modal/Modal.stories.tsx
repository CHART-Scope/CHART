import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Button } from "../Button";
import { Modal } from ".";

const meta: Meta<typeof Modal> = {
  title: "Primitives/Modal",
  component: Modal,
};
export default meta;
type Story = StoryObj<typeof Modal>;

export const Precision: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Precision"
          description="Precision indicates how precise the model estimate is. Estimates based on more complete and locally relevant data are generally more precise and therefore have lower uncertainty."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setOpen(false)}>Improve precision</Button>
            </>
          }
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              marginBottom: 8,
              color: "var(--color-amber)",
            }}
          >
            Precision: Moderate
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-charcoal)",
              lineHeight: 1.6,
            }}
          >
            The estimate is reasonably precise, but there is some uncertainty around the
            projected effect. Providing local data can improve its precision.
          </p>
        </Modal>
      </>
    );
  },
};
